import { supabase } from '../config/supabase.js';
import { parseCSV } from '../utils/csvParser.js';

/**
 * Standardize date to YYYY-MM-DD
 */
const normalizeDate = (rawDate) => {
  if (!rawDate) return null;
  const s = String(rawDate).trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // MM-DD-YYYY or MM/DD/YYYY
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
};

/**
 * Normalize and validate a single transaction candidate row
 */
const normalizeRecord = (raw, index) => {
  const errors = [];

  // Extract date
  const rawDate =
    raw.date || raw.transaction_date || raw.tx_date || raw.datetime || raw.timestamp;
  const date = normalizeDate(rawDate);
  if (!date) {
    errors.push(`Row ${index + 1}: Invalid or missing date '${rawDate}'`);
  }

  // Extract amount
  const rawAmount =
    raw.amount || raw.trans_amount || raw.debit || raw.credit || raw.value;
  const cleanAmountStr = String(rawAmount || '')
    .replace(/[₹$,]/g, '')
    .trim();
  const amount = parseFloat(cleanAmountStr);
  if (isNaN(amount) || amount <= 0) {
    errors.push(`Row ${index + 1}: Invalid amount '${rawAmount}'`);
  }

  // Extract type
  let type = 'expense';
  const rawType = (raw.type || raw.transaction_type || raw.tx_type || '').toLowerCase();
  if (rawType.includes('credit') || rawType.includes('income') || rawType.includes('cr')) {
    type = 'income';
  } else if (raw.credit && parseFloat(raw.credit) > 0) {
    type = 'income';
  }

  // Extract title / merchant
  const title = (
    raw.title ||
    raw.merchant ||
    raw.description ||
    raw.narration ||
    raw.payee ||
    raw.remarks ||
    'UPI Transaction'
  ).trim();

  // Extract category
  const category = (
    raw.category ||
    raw.expense_category ||
    (type === 'income' ? 'Income' : 'Other')
  ).trim();

  // Extract payment method / provider
  const paymentMethod = (
    raw.payment_method ||
    raw.provider ||
    raw.payment_provider ||
    raw.mode ||
    'UPI'
  ).trim();

  // Extract external reference ID
  const externalId = (
    raw.external_id ||
    raw.reference_id ||
    raw.ref_id ||
    raw.utr ||
    raw.transaction_id ||
    raw.tx_ref ||
    ''
  ).trim();

  const notes = (raw.notes || raw.remarks || '').trim();

  return {
    rowIndex: index + 1,
    isValid: errors.length === 0,
    errors,
    data: {
      date,
      amount,
      type,
      title,
      category,
      payment_method: paymentMethod,
      external_id: externalId || null,
      notes: notes || null,
    },
  };
};

/**
 * Duplicate detector against existing user transactions
 */
const checkDuplicates = async (userId, records) => {
  // Query all recent user transactions to verify uniqueness
  const { data: existingTxs } = await supabase
    .from('transactions')
    .select('id, title, amount, date, type, external_id')
    .eq('user_id', userId);

  const existingByRef = new Map();
  const existingBySignature = new Set();

  (existingTxs || []).forEach((tx) => {
    if (tx.external_id) {
      existingByRef.set(tx.external_id.toLowerCase(), tx.id);
    }
    const signature = `${tx.date}_${Number(tx.amount)}_${tx.title.toLowerCase().trim()}`;
    existingBySignature.add(signature);
  });

  return records.map((rec) => {
    if (!rec.isValid) return { ...rec, isDuplicate: false };

    const { date, amount, title, external_id } = rec.data;
    let isDuplicate = false;
    let duplicateReason = null;

    if (external_id && existingByRef.has(external_id.toLowerCase())) {
      isDuplicate = true;
      duplicateReason = `Matches existing reference ID '${external_id}'`;
    } else {
      const signature = `${date}_${Number(amount)}_${title.toLowerCase().trim()}`;
      if (existingBySignature.has(signature)) {
        isDuplicate = true;
        duplicateReason = `Matches existing transaction (${date}, ₹${amount}, '${title}')`;
      }
    }

    return {
      ...rec,
      isDuplicate,
      duplicateReason,
    };
  });
};

// @desc    Preview CSV transactions & check duplicates before saving
// @route   POST /api/import/preview
// @access  Private
export const previewImport = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { csvText, records, provider } = req.body;

    let rawRows = [];
    if (Array.isArray(records)) {
      rawRows = records;
    } else if (csvText) {
      rawRows = parseCSV(csvText);
    }

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No transaction rows found to parse',
      });
    }

    // Normalize each row
    const normalized = rawRows.map((r, i) => {
      const parsed = normalizeRecord(r, i);
      if (provider && !parsed.data.payment_method) {
        parsed.data.payment_method = provider;
      }
      return parsed;
    });

    // Check duplicates
    const evaluated = await checkDuplicates(userId, normalized);

    const validCount = evaluated.filter((r) => r.isValid && !r.isDuplicate).length;
    const duplicateCount = evaluated.filter((r) => r.isDuplicate).length;
    const invalidCount = evaluated.filter((r) => !r.isValid).length;

    return res.status(200).json({
      success: true,
      summary: {
        total_rows: rawRows.length,
        valid_count: validCount,
        duplicate_count: duplicateCount,
        invalid_count: invalidCount,
      },
      records: evaluated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Execute transaction import into Supabase & record in sync_logs
// @route   POST /api/import/transactions
// @access  Private
export const executeImport = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      records,
      csvText,
      provider = 'CSV_IMPORT',
      skipDuplicates = true,
      bank_account_id = null,
    } = req.body;

    let rawRows = [];
    if (Array.isArray(records)) {
      rawRows = records;
    } else if (csvText) {
      rawRows = parseCSV(csvText);
    }

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No records provided for import',
      });
    }

    // Normalize and evaluate
    const normalized = rawRows.map((r, i) => {
      // If client sent already normalized format data object
      if (r.data) return r;
      return normalizeRecord(r, i);
    });

    const evaluated = await checkDuplicates(userId, normalized);

    const toInsert = [];
    const skippedDuplicates = [];
    const failedRows = [];

    evaluated.forEach((rec) => {
      if (!rec.isValid) {
        failedRows.push({ rowIndex: rec.rowIndex, errors: rec.errors });
        return;
      }

      if (rec.isDuplicate) {
        if (skipDuplicates) {
          skippedDuplicates.push({ rowIndex: rec.rowIndex, reason: rec.duplicateReason });
          return;
        }
      }

      toInsert.push({
        user_id: userId,
        title: rec.data.title,
        amount: Number(rec.data.amount),
        type: rec.data.type,
        category: rec.data.category,
        date: rec.data.date,
        payment_method: rec.data.payment_method || provider,
        external_id: rec.data.external_id || null,
        notes: rec.data.notes || `Imported via ${provider}`,
        source: 'csv_import',
      });
    });

    let insertedRecords = [];
    let insertError = null;

    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from('transactions')
        .insert(toInsert)
        .select();

      if (error) {
        insertError = error.message;
      } else {
        insertedRecords = data || [];
      }
    }

    // Record audit trail in sync_logs
    const syncStatus = insertError
      ? 'failed'
      : toInsert.length === 0 && skippedDuplicates.length > 0
      ? 'completed'
      : 'completed';

    await supabase.from('sync_logs').insert([
      {
        user_id: userId,
        bank_account_id: bank_account_id || null,
        provider,
        status: syncStatus,
        imported_count: insertedRecords.length,
        duplicate_count: skippedDuplicates.length,
        error_message: insertError || null,
        completed_at: new Date().toISOString(),
      },
    ]);

    if (insertError) {
      return res.status(500).json({
        success: false,
        message: `Import failed: ${insertError}`,
        summary: {
          imported: 0,
          duplicates: skippedDuplicates.length,
          failed: failedRows.length,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully imported ${insertedRecords.length} transactions (${skippedDuplicates.length} duplicates skipped)`,
      summary: {
        imported: insertedRecords.length,
        duplicates: skippedDuplicates.length,
        failed: failedRows.length,
        total_submitted: rawRows.length,
      },
      imported_transactions: insertedRecords,
      failed_rows: failedRows,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get import history from sync_logs
// @route   GET /api/import/history
// @access  Private
export const getImportHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: logs, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve import history',
      });
    }

    return res.status(200).json({
      success: true,
      data: logs || [],
    });
  } catch (err) {
    next(err);
  }
};

export default {
  previewImport,
  executeImport,
  getImportHistory,
};

