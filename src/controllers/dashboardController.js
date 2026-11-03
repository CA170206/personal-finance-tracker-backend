import Transaction from '../models/Transaction.js';
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
    const { period = 'all' } = req.query;
    const transactions = await Transaction.find({ user: req.user._id }).sort({ date: -1 });

    const summary = calculateFinancialSummary(transactions, period);
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
    const transactions = await Transaction.find({ user: req.user._id }).sort({ date: -1 });

    const monthlyOverview = calculateMonthlyOverview(transactions, 6);
    const expenseBreakdown = calculateExpenseBreakdown(transactions);
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
      hasData: transactions.length > 0,
    });
  } catch (error) {
    next(error);
  }
};

export default { getSummary, getCharts };

