import { supabase } from '../config/supabase.js';
import { maskNumber } from '../utils/encryption.js';
import { ACCOUNT_AGGREGATOR_STATUS } from '../services/providerAdapters.js';

/**
 * Format database row into clean API response
 */
const formatAccountRow = (row) => ({
  id: row.id,
  user_id: row.user_id,
  institution_name: row.institution_name,
  bank_name: row.institution_name,
  account_holder: row.provider || 'Self',
  account_type: row.account_type || 'Savings',
  masked_account_number: row.masked_account_number,
  balance: parseFloat(row.consent_reference) || 0,
  integration_status: row.integration_status || 'manual',
  provider: row.provider,
  is_active: row.is_active,
  created_at: row.created_at,
  last_synced_at: row.last_synced_at,
});

// @desc    Get all bank accounts for authenticated user
// @route   GET /api/bank-accounts
// @access  Private
export const getBankAccounts = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: accounts, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Bank Accounts] Fetch error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve bank accounts',
      });
    }

    const formatted = (accounts || []).map(formatAccountRow);
    const totalBalance = formatted.reduce((sum, acc) => sum + (acc.balance || 0), 0);

    return res.status(200).json({
      success: true,
      data: formatted,
      total_balance: totalBalance,
      integration_info: ACCOUNT_AGGREGATOR_STATUS,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single bank account by ID
// @route   GET /api/bank-accounts/:id
// @access  Private
export const getBankAccountById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: account, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !account) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: formatAccountRow(account),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Add a bank account manually
// @route   POST /api/bank-accounts
// @access  Private
export const createBankAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      institution_name,
      bank_name,
      account_holder,
      account_type,
      account_number,
      balance,
    } = req.body;

    const name = (institution_name || bank_name || '').trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide institution or bank name',
      });
    }

    const type = (account_type || 'Savings').trim();
    const holder = (account_holder || req.user.name || 'Self').trim();
    const numBalance = Number(balance);
    const validBalance = isNaN(numBalance) ? 0 : numBalance;

    // Mask account number safely (never store plain raw full account number)
    let masked = '•••• 0000';
    if (account_number) {
      const cleanNum = String(account_number).replace(/\s+/g, '');
      masked = maskNumber(cleanNum, 4);
    }

    const { data: created, error } = await supabase
      .from('bank_accounts')
      .insert([
        {
          user_id: userId,
          institution_name: name,
          account_type: type,
          masked_account_number: masked,
          provider: holder,
          consent_reference: String(validBalance),
          integration_status: 'manual',
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error || !created) {
      console.error('[Bank Accounts] Creation error:', error?.message);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to save bank account',
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Bank account added successfully',
      data: formatAccountRow(created),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update an existing bank account
// @route   PUT /api/bank-accounts/:id
// @access  Private
export const updateBankAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      institution_name,
      bank_name,
      account_holder,
      account_type,
      account_number,
      balance,
    } = req.body;

    // Verify ownership first
    const { data: existing, error: findError } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !existing) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found',
      });
    }

    const updates = {};
    if (institution_name || bank_name) {
      updates.institution_name = (institution_name || bank_name).trim();
    }
    if (account_type) {
      updates.account_type = account_type.trim();
    }
    if (account_holder) {
      updates.provider = account_holder.trim();
    }
    if (balance !== undefined) {
      const numBal = Number(balance);
      updates.consent_reference = String(isNaN(numBal) ? 0 : numBal);
    }
    if (account_number) {
      const cleanNum = String(account_number).replace(/\s+/g, '');
      updates.masked_account_number = maskNumber(cleanNum, 4);
    }

    const { data: updated, error: updateError } = await supabase
      .from('bank_accounts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[Bank Accounts] Update error:', updateError?.message);
      return res.status(500).json({
        success: false,
        message: updateError?.message || 'Failed to update bank account',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bank account updated successfully',
      data: formatAccountRow(updated),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Remove/deactivate a bank account
// @route   DELETE /api/bank-accounts/:id
// @access  Private
export const deleteBankAccount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Hard delete or deactivate with user isolation
    const { error } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('[Bank Accounts] Delete error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete bank account',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bank account removed successfully',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get transactions associated with bank account
// @route   GET /api/bank-accounts/:id/transactions
// @access  Private
export const getBankAccountTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: account, error: accError } = await supabase
      .from('bank_accounts')
      .select('institution_name, masked_account_number')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (accError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Bank account not found',
      });
    }

    const bankName = account.institution_name;
    const { data: txs, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .or(`payment_method.ilike.%${bankName}%,notes.ilike.%${bankName}%`)
      .order('date', { ascending: false })
      .limit(20);

    if (txError) {
      return res.status(200).json({ success: true, data: [] });
    }

    return res.status(200).json({
      success: true,
      data: txs || [],
    });
  } catch (err) {
    next(err);
  }
};

export default {
  getBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getBankAccountTransactions,
};

