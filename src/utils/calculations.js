/**
 * Pure financial calculation utilities for FinTrack PRO Backend
 */

export const calculateFinancialSummary = (transactions, period = 'all') => {
  if (!transactions || transactions.length === 0) {
    return {
      totalBalance: 0,
      totalIncome: 0,
      totalExpenses: 0,
      savingsRate: 0,
      trends: null,
    };
  }

  // Calculate overall totals
  let totalIncome = 0;
  let totalExpenses = 0;

  transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amt;
    } else if (tx.type === 'expense') {
      totalExpenses += amt;
    }
  });

  const totalBalance = totalIncome - totalExpenses;
  const savingsRate =
    totalIncome > 0
      ? Math.max(0, Math.min(100, Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)))
      : 0;

  // Month-over-month trend calculations
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  const prevMonthDate = new Date(curYear, curMonth - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();

  let curMonthIncome = 0;
  let curMonthExpense = 0;
  let prevMonthIncome = 0;
  let prevMonthExpense = 0;
  let hasPrevMonthData = false;

  transactions.forEach((tx) => {
    if (!tx.date) return;
    const d = new Date(tx.date);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const amt = Number(tx.amount) || 0;

    if (yr === curYear && mo === curMonth) {
      if (tx.type === 'income') curMonthIncome += amt;
      if (tx.type === 'expense') curMonthExpense += amt;
    } else if (yr === prevYear && mo === prevMonth) {
      hasPrevMonthData = true;
      if (tx.type === 'income') prevMonthIncome += amt;
      if (tx.type === 'expense') prevMonthExpense += amt;
    }
  });

  let trends = null;
  if (hasPrevMonthData) {
    const incomeChange =
      prevMonthIncome > 0
        ? Math.round(((curMonthIncome - prevMonthIncome) / prevMonthIncome) * 100)
        : curMonthIncome > 0
        ? 100
        : 0;

    const expenseChange =
      prevMonthExpense > 0
        ? Math.round(((curMonthExpense - prevMonthExpense) / prevMonthExpense) * 100)
        : curMonthExpense > 0
        ? 100
        : 0;

    const curMonthBalance = curMonthIncome - curMonthExpense;
    const prevMonthBalance = prevMonthIncome - prevMonthExpense;
    const balanceChange =
      prevMonthBalance !== 0
        ? Math.round(((curMonthBalance - prevMonthBalance) / Math.abs(prevMonthBalance)) * 100)
        : curMonthBalance > 0
        ? 100
        : 0;

    const curSavingsRate =
      curMonthIncome > 0
        ? Math.round(((curMonthIncome - curMonthExpense) / curMonthIncome) * 100)
        : 0;
    const prevSavingsRate =
      prevMonthIncome > 0
        ? Math.round(((prevMonthIncome - prevMonthExpense) / prevMonthIncome) * 100)
        : 0;
    const savingsRateChange = curSavingsRate - prevSavingsRate;

    trends = {
      incomeChange,
      expenseChange,
      balanceChange,
      savingsRateChange,
    };
  }

  return {
    totalBalance,
    totalIncome,
    totalExpenses,
    savingsRate,
    trends,
  };
};

export const calculateMonthlyOverview = (transactions, monthCount = 6) => {
  const result = [];
  const now = new Date();

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = d.toLocaleString('en-US', { month: 'short' });
    const yearVal = d.getFullYear();
    const monthVal = d.getMonth();

    let income = 0;
    let expenses = 0;

    (transactions || []).forEach((tx) => {
      if (!tx.date) return;
      const txDate = new Date(tx.date);
      if (txDate.getFullYear() === yearVal && txDate.getMonth() === monthVal) {
        const amt = Number(tx.amount) || 0;
        if (tx.type === 'income') income += amt;
        if (tx.type === 'expense') expenses += amt;
      }
    });

    result.push({
      month: monthKey,
      income,
      expenses,
      net: income - expenses,
    });
  }

  return result;
};

const CATEGORY_COLORS = {
  Housing: '#10B981',
  'Food & Dining': '#3B82F6',
  Transportation: '#F59E0B',
  Utilities: '#8B5CF6',
  Entertainment: '#EC4899',
  Healthcare: '#06B6D4',
  Shopping: '#F97316',
  Investment: '#6366F1',
  Education: '#14B8A6',
  Personal: '#84CC16',
  Other: '#64748B',
};

export const calculateExpenseBreakdown = (transactions) => {
  const categoryTotals = {};
  let totalExpense = 0;

  (transactions || []).forEach((tx) => {
    if (tx.type === 'expense') {
      const amt = Number(tx.amount) || 0;
      const cat = tx.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      totalExpense += amt;
    }
  });

  const categories = Object.keys(categoryTotals);
  if (categories.length === 0 || totalExpense === 0) {
    return [];
  }

  return categories
    .map((name) => {
      const value = categoryTotals[name];
      const percentage = Math.round((value / totalExpense) * 100);
      return {
        name,
        value,
        percentage,
        color: CATEGORY_COLORS[name] || '#94A3B8',
      };
    })
    .sort((a, b) => b.value - a.value);
};

export default {
  calculateFinancialSummary,
  calculateMonthlyOverview,
  calculateExpenseBreakdown,
};

