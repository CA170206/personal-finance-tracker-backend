import { supabase } from '../config/supabase.js';
import { encrypt, decrypt, maskNumber } from '../utils/encryption.js';
import { BHARAT_CONNECT_STATUS } from '../services/providerAdapters.js';

export const BILL_CATEGORIES = [
  'Electricity',
  'Water',
  'Gas',
  'Mobile recharge',
  'Broadband',
  'DTH',
  'Other',
];

/**
 * Format a database bill row for client response
 * Masks the encrypted consumer number so plaintext is never exposed
 */
const formatBillRow = (row) => {
  let maskedConsumerNumber = '•••• ••••';
  if (row.encrypted_consumer_number) {
    const decrypted = decrypt(row.encrypted_consumer_number);
    if (decrypted) {
      maskedConsumerNumber = maskNumber(decrypted, 4);
    }
  }

  // Calculate dynamic status if pending and past due
  let computedStatus = row.status || 'pending';
  if (computedStatus === 'pending' && row.due_date) {
    const today = new Date().toISOString().split('T')[0];
    if (row.due_date < today) {
      computedStatus = 'overdue';
    }
  }

  return {
    id: row.id,
    user_id: row.user_id,
    bill_type: row.bill_type || 'Other',
    category: row.bill_type || 'Other',
    provider: row.provider,
    amount: parseFloat(row.amount) || 0,
    due_date: row.due_date,
    billing_period: row.billing_period || 'monthly',
    is_recurring: row.billing_period && row.billing_period !== 'one-off',
    status: computedStatus,
    masked_consumer_number: maskedConsumerNumber,
    payment_reference: row.payment_reference,
    transaction_id: row.transaction_id,
    source: row.source || 'manual',
    paid_at: row.paid_at,
    created_at: row.created_at,
  };
};

// @desc    Get all bills for authenticated user with filters
// @route   GET /api/bills
// @access  Private
export const getBills = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { category, status, search } = req.query;

    let query = supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true });

    if (category && category !== 'all') {
      query = query.eq('bill_type', category);
    }

    if (status && status !== 'all') {
      if (status !== 'overdue') {
        query = query.eq('status', status);
      }
    }

    const { data: bills, error } = await query;

    if (error) {
      console.error('[Bills] Fetch error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve bills',
      });
    }

    let formatted = (bills || []).map(formatBillRow);

    // Filter by overdue if explicitly requested
    if (status === 'overdue') {
      formatted = formatted.filter((b) => b.status === 'overdue');
    }

    // Filter by search
    if (search && search.trim() !== '') {
      const term = search.trim().toLowerCase();
      formatted = formatted.filter(
        (b) =>
          b.provider.toLowerCase().includes(term) ||
          b.category.toLowerCase().includes(term) ||
          b.masked_consumer_number.toLowerCase().includes(term)
      );
    }

    return res.status(200).json({
      success: true,
      data: formatted,
      total: formatted.length,
      bbps_adapter_status: BHARAT_CONNECT_STATUS,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get monthly bill summary and analytics
// @route   GET /api/bills/summary
// @access  Private
export const getBillsSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({ success: false, message: 'Failed to compute bill summary' });
    }

    const formatted = (bills || []).map(formatBillRow);
    const today = new Date().toISOString().split('T')[0];

    let totalPending = 0;
    let totalPaid = 0;
    let overdueCount = 0;
    let upcomingCount = 0;
    const categoryTotals = {};

    formatted.forEach((bill) => {
      if (bill.status === 'paid') {
        totalPaid += bill.amount;
      } else {
        totalPending += bill.amount;
        if (bill.status === 'overdue') {
          overdueCount++;
        } else {
          upcomingCount++;
        }
      }

      categoryTotals[bill.category] = (categoryTotals[bill.category] || 0) + bill.amount;
    });

    // Upcoming within 7 days
    const upcomingBills = formatted.filter((b) => {
      if (b.status === 'paid') return false;
      const due = new Date(b.due_date);
      const diffDays = Math.ceil((due - new Date()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });

    return res.status(200).json({
      success: true,
      summary: {
        total_pending: totalPending,
        total_paid: totalPaid,
        overdue_count: overdueCount,
        upcoming_count: upcomingCount,
        category_breakdown: categoryTotals,
        upcoming_within_7_days: upcomingBills,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single bill by ID
// @route   GET /api/bills/:id
// @access  Private
export const getBillById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: bill, error } = await supabase
      .from('bills')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: formatBillRow(bill),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Add a bill manually with encrypted consumer number
// @route   POST /api/bills
// @access  Private
export const createBill = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      bill_type,
      category,
      provider,
      consumer_number,
      amount,
      due_date,
      billing_period,
      status,
      notes,
    } = req.body;

    const billCat = (bill_type || category || 'Other').trim();
    const billProvider = (provider || '').trim();
    const numAmount = Number(amount);
    const dueDate = due_date;

    if (!billProvider) {
      return res.status(400).json({
        success: false,
        message: 'Please provide biller or service provider name',
      });
    }

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Bill amount must be a positive number',
      });
    }

    if (!dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Please specify the bill due date',
      });
    }

    // Encrypt sensitive consumer/account reference number
    const encryptedConsumerNum = consumer_number
      ? encrypt(String(consumer_number).trim())
      : null;

    const initialStatus = status === 'paid' ? 'paid' : 'pending';

    const { data: created, error } = await supabase
      .from('bills')
      .insert([
        {
          user_id: userId,
          bill_type: billCat,
          provider: billProvider,
          encrypted_consumer_number: encryptedConsumerNum,
          amount: numAmount,
          due_date: dueDate,
          billing_period: billing_period || 'monthly',
          status: initialStatus,
          payment_reference: notes || null,
          source: 'manual',
        },
      ])
      .select()
      .single();

    if (error || !created) {
      console.error('[Bills] Create error:', error?.message);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to save bill',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Bill created successfully',
      data: formatBillRow(created),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update an existing bill
// @route   PUT /api/bills/:id
// @access  Private
export const updateBill = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      bill_type,
      category,
      provider,
      consumer_number,
      amount,
      due_date,
      billing_period,
      status,
      notes,
    } = req.body;

    const { data: existing, error: findError } = await supabase
      .from('bills')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !existing) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found',
      });
    }

    const updates = {};
    if (bill_type || category) {
      updates.bill_type = (bill_type || category).trim();
    }
    if (provider) {
      updates.provider = provider.trim();
    }
    if (amount !== undefined) {
      const numAmt = Number(amount);
      if (!isNaN(numAmt) && numAmt > 0) updates.amount = numAmt;
    }
    if (due_date) {
      updates.due_date = due_date;
    }
    if (billing_period) {
      updates.billing_period = billing_period;
    }
    if (status) {
      updates.status = status;
      if (status === 'paid' && !existing.paid_at) {
        updates.paid_at = new Date().toISOString();
      }
    }
    if (consumer_number) {
      updates.encrypted_consumer_number = encrypt(String(consumer_number).trim());
    }
    if (notes !== undefined) {
      updates.payment_reference = notes;
    }

    const { data: updated, error: updateError } = await supabase
      .from('bills')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError || !updated) {
      return res.status(500).json({
        success: false,
        message: updateError?.message || 'Failed to update bill',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bill updated successfully',
      data: formatBillRow(updated),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark bill as paid & optionally log expense transaction
// @route   PATCH /api/bills/:id/pay
// @access  Private
export const markBillPaid = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { logTransaction, payment_method } = req.body;

    const { data: bill, error: findError } = await supabase
      .from('bills')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found',
      });
    }

    let createdTxId = null;

    // Optional: Log an expense in transactions for this bill payment
    if (logTransaction) {
      const txPayload = {
        user_id: userId,
        title: `${bill.provider} Bill Payment`,
        amount: Number(bill.amount),
        type: 'expense',
        category: 'Utilities',
        date: new Date().toISOString().split('T')[0],
        notes: `Paid ${bill.bill_type} bill (${bill.provider})`,
        source: 'bill_payment',
        payment_method: payment_method || 'UPI',
      };

      const { data: newTx } = await supabase
        .from('transactions')
        .insert([txPayload])
        .select()
        .single();

      if (newTx) createdTxId = newTx.id;
    }

    const updates = {
      status: 'paid',
      paid_at: new Date().toISOString(),
    };
    if (createdTxId) updates.transaction_id = createdTxId;

    const { data: updatedBill, error: updateError } = await supabase
      .from('bills')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError || !updatedBill) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update bill status',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bill marked as paid',
      data: formatBillRow(updatedBill),
      transaction_id: createdTxId,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a bill
// @route   DELETE /api/bills/:id
// @access  Private
export const deleteBill = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabase
      .from('bills')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete bill',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bill deleted successfully',
    });
  } catch (err) {
    next(err);
  }
};

export default {
  BILL_CATEGORIES,
  getBills,
  getBillsSummary,
  getBillById,
  createBill,
  updateBill,
  markBillPaid,
  deleteBill,
};

