import { supabase } from '../config/supabase.js';
import {
  calculateFinancialSummary,
  calculateMonthlyOverview,
  calculateExpenseBreakdown,
} from '../utils/calculations.js';

// @desc    Get dashboard financial metrics summary
// @route   GET /api/dashboard/summary
// @access  Private
export const getSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { period = 'all' } = req.query;

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) {
      console.error('[Dashboard Summary] Query error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction data for summary',
      });
    }

    const summary = calculateFinancialSummary(transactions || [], period);
    return res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard charts and telemetry
// @route   GET /api/dashboard/charts
// @access  Private
export const getCharts = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) {
      console.error('[Dashboard Charts] Query error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve transaction data for charts',
      });
    }

    const txList = transactions || [];
    const monthlyOverview = calculateMonthlyOverview(txList, 6);
    const expenseBreakdown = calculateExpenseBreakdown(txList);
    const totalExpenses = expenseBreakdown.reduce((sum, item) => sum + item.value, 0);

    const spendingTrends = monthlyOverview.map((item) => ({
      month: item.month,
      expenses: item.expenses,
    }));

    return res.status(200).json({
      monthlyOverview,
      expenseBreakdown,
      totalExpenses,
      spendingTrends,
      hasData: txList.length > 0,
    });
  } catch (error) {
    next(error);
  }
};

export default { getSummary, getCharts };
