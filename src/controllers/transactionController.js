import { supabase } from '../config/supabase.js';

// @desc    Get all transactions with filtering and sorting
// @route   GET /api/transactions
// @access  Private
export const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type, category, search, startDate, endDate, sort, payment_method, provider } = req.query;

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    // Filter by type (income / expense)
    if (type && type !== 'all') {
      query = query.eq('type', type);
    }

    // Filter by payment method / provider (e.g. Google Pay, PhonePe, Paytm, Other)
    const methodFilter = payment_method || provider;
    if (methodFilter && methodFilter !== 'all') {
      if (methodFilter.toLowerCase() === 'other') {
        // Exclude big 3 providers
        query = query.not('payment_method', 'ilike', '%Google Pay%')
                     .not('payment_method', 'ilike', '%PhonePe%')
                     .not('payment_method', 'ilike', '%Paytm%');
      } else {
        query = query.ilike('payment_method', `%${methodFilter}%`);
      }
    }

    // Filter by category
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    // Filter by date range
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    // Search by title or notes (case-insensitive substring)
    if (search && search.trim() !== '') {
      const term = search.trim();
      query = query.or(`title.ilike.%${term}%,notes.ilike.%${term}%`);
    }

    // Sorting
    if (sort === 'oldest') {
      query = query.order('date', { ascending: true }).order('created_at', { ascending: true });
    } else if (sort === 'amount-desc') {
      query = query.order('amount', { ascending: false });
    } else if (sort === 'amount-asc') {
      query = query.order('amount', { ascending: true });
    } else {
      // Default: newest first
      query = query.order('date', { ascending: false }).order('created_at', { ascending: false });
    }

    const { data: transactions, count, error } = await query;

    if (error) {
      console.error('[Get Transactions] Query error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transactions from database',
      });
    }

    return res.status(200).json({
      data: transactions || [],
      total: count !== null ? count : (transactions || []).length,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new transaction
// @route   POST /api/transactions
// @access  Private
export const createTransaction = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, amount, type, category, date, notes, payment_method, external_id, source } = req.body;

    if (!title || amount === undefined || !type || !category || !date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, amount, type, category and date',
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a valid positive number',
      });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "income" or "expense"',
      });
    }

    const { data: transaction, error } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: userId,
          title: title.trim(),
          amount: numAmount,
          type,
          category: category.trim(),
          date,
          notes: notes ? notes.trim() : '',
          source: source || 'manual',
          payment_method: payment_method || null,
          external_id: external_id || null,
        },
      ])
      .select()
      .single();

    if (error || !transaction) {
      console.error('[Create Transaction] Insert failed:', error?.message);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to save transaction',
      });
    }

    return res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
};

// @desc    Update an existing transaction
// @route   PUT /api/transactions/:id
// @access  Private
export const updateTransaction = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, amount, type, category, date, notes, payment_method, external_id } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (title) updates.title = title.trim();
    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a valid positive number',
        });
      }
      updates.amount = numAmount;
    }
    if (type && ['income', 'expense'].includes(type)) {
      updates.type = type;
    }
    if (category) updates.category = category.trim();
    if (date) updates.date = date;
    if (notes !== undefined) updates.notes = notes ? notes.trim() : '';
    if (payment_method !== undefined) updates.payment_method = payment_method;
    if (external_id !== undefined) updates.external_id = external_id;

    const { data: updated, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !updated) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or access denied',
      });
    }

    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single transaction by ID
// @route   GET /api/transactions/:id
// @access  Private
export const getTransactionById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or access denied',
      });
    }

    return res.status(200).json(transaction);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a transaction
// @route   DELETE /api/transactions/:id
// @access  Private
export const deleteTransaction = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or access denied',
      });
    }

    return res.status(200).json({
      success: true,
      id,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
