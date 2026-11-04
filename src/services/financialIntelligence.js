/**
 * FinTrack AI — Deterministic Financial Intelligence & Analytics Engine
 *
 * Provides mathematically accurate, deterministic financial computations:
 * - Expense anomaly & spike detection
 * - Subscription & recurring payment detection
 * - Month-end spending run-rate projections
 * - Affordability calculator for planned purchases
 * - Category spending shifts and trend deltas
 * - Savings opportunities & budget overrun tracking
 */

/**
 * Detect unusually high expenses (anomalies) based on statistical distribution
 */
export const detectAnomalousExpenses = (transactions, stdDevMultiplier = 2.0) => {
  const expenses = (transactions || []).filter(
    (t) => t.type === 'expense' && Number(t.amount) > 0
  );

  if (expenses.length < 3) return [];

  const amounts = expenses.map((t) => Number(t.amount));
  const total = amounts.reduce((sum, a) => sum + a, 0);
  const mean = total / amounts.length;

  const variance =
    amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);

  const threshold = Math.max(mean + stdDevMultiplier * stdDev, mean * 1.75);

  const anomalies = expenses
    .filter((t) => Number(t.amount) >= threshold)
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      amount: Number(t.amount),
      date: t.date,
      meanSpending: Math.round(mean),
      deviationFactor: Number((Number(t.amount) / (mean || 1)).toFixed(1)),
    }));

  return anomalies;
};

/**
 * Detect recurring expenses and subscriptions from transaction history
 */
export const detectRecurringExpenses = (transactions) => {
  const expenses = (transactions || []).filter(
    (t) => t.type === 'expense' && Number(t.amount) > 0 && t.date
  );

  if (expenses.length < 2) return [];

  // Common subscription keywords
  const subKeywords = [
    'netflix',
    'spotify',
    'prime',
    'amazon',
    'hotstar',
    'youtube',
    'gym',
    'wifi',
    'broadband',
    'airtel',
    'jio',
    'rent',
    'lease',
    'insurance',
    'electricity',
    'water',
    'gas',
    'apple',
    'google',
    'cloud',
    'domain',
    'subscription',
  ];

  // Group by normalized title
  const titleGroups = {};

  expenses.forEach((t) => {
    const rawTitle = (t.title || '').trim().toLowerCase();
    // Normalize: remove special chars, dates
    const cleanTitle = rawTitle.replace(/[0-9_#.-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanTitle) return;

    if (!titleGroups[cleanTitle]) {
      titleGroups[cleanTitle] = [];
    }
    titleGroups[cleanTitle].push(t);
  });

  const recurringList = [];

  Object.entries(titleGroups).forEach(([title, txs]) => {
    const hasKeyword = subKeywords.some((k) => title.includes(k));

    // Sort by date ascending
    txs.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Check if repeated at least twice, or matches a clear subscription keyword
    if (txs.length >= 2 || (hasKeyword && txs.length >= 1)) {
      const latestTx = txs[txs.length - 1];
      const avgAmount =
        txs.reduce((sum, t) => sum + Number(t.amount), 0) / txs.length;

      recurringList.push({
        title: latestTx.title,
        normalizedTitle: title,
        category: latestTx.category,
        amount: Math.round(avgAmount),
        frequency: 'monthly',
        occurrences: txs.length,
        lastChargedDate: latestTx.date,
        projectedAnnualCost: Math.round(avgAmount * 12),
        isConfirmedSubscription: hasKeyword,
      });
    }
  });

  return recurringList.sort((a, b) => b.amount - a.amount);
};

/**
 * Deterministic month-end spending projection based on current month's burn rate
 */
export const estimateMonthEndSpending = (transactions) => {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const currentDay = Math.max(1, now.getDate());
  const remainingDays = Math.max(0, daysInMonth - currentDay);

  let currentMonthIncome = 0;
  let currentMonthExpense = 0;

  (transactions || []).forEach((t) => {
    if (!t.date) return;
    const d = new Date(t.date);
    if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') currentMonthIncome += amt;
      if (t.type === 'expense') currentMonthExpense += amt;
    }
  });

  const dailyBurnRate = currentMonthExpense / currentDay;
  const projectedRemainingExpense = dailyBurnRate * remainingDays;
  const projectedTotalExpense = Math.round(currentMonthExpense + projectedRemainingExpense);
  const projectedRemainingBalance = Math.round(currentMonthIncome - projectedTotalExpense);

  return {
    curMonthName: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    currentDay,
    totalDaysInMonth: daysInMonth,
    remainingDays,
    actualIncomeSoFar: Math.round(currentMonthIncome),
    actualExpenseSoFar: Math.round(currentMonthExpense),
    dailyBurnRate: Math.round(dailyBurnRate),
    projectedTotalExpense,
    projectedRemainingBalance,
    burnRateWarning:
      currentMonthIncome > 0 && projectedTotalExpense > currentMonthIncome,
  };
};

/**
 * Compare spending between current month and previous month with category breakdown
 */
export const compareMonthlySpending = (transactions) => {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  const prevDate = new Date(curYear, curMonth - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth();

  let curIncome = 0;
  let curExpense = 0;
  let prevIncome = 0;
  let prevExpense = 0;

  const curCatMap = {};
  const prevCatMap = {};

  (transactions || []).forEach((t) => {
    if (!t.date) return;
    const d = new Date(t.date);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const amt = Number(t.amount) || 0;
    const cat = t.category || 'General';

    if (yr === curYear && mo === curMonth) {
      if (t.type === 'income') curIncome += amt;
      if (t.type === 'expense') {
        curExpense += amt;
        curCatMap[cat] = (curCatMap[cat] || 0) + amt;
      }
    } else if (yr === prevYear && mo === prevMonth) {
      if (t.type === 'income') prevIncome += amt;
      if (t.type === 'expense') {
        prevExpense += amt;
        prevCatMap[cat] = (prevCatMap[cat] || 0) + amt;
      }
    }
  });

  const expenseDiff = curExpense - prevExpense;
  const expensePercentageChange =
    prevExpense > 0
      ? Math.round((expenseDiff / prevExpense) * 100)
      : curExpense > 0
      ? 100
      : 0;

  // Category comparison
  const allCategories = Array.from(
    new Set([...Object.keys(curCatMap), ...Object.keys(prevCatMap)])
  );

  const categoryDeltas = allCategories.map((cat) => {
    const curVal = curCatMap[cat] || 0;
    const prevVal = prevCatMap[cat] || 0;
    const diff = curVal - prevVal;
    const pct =
      prevVal > 0 ? Math.round((diff / prevVal) * 100) : curVal > 0 ? 100 : 0;
    return {
      category: cat,
      current: Math.round(curVal),
      previous: Math.round(prevVal),
      difference: Math.round(diff),
      percentageChange: pct,
    };
  });

  categoryDeltas.sort((a, b) => b.difference - a.difference);

  return {
    currentPeriod: now.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    previousPeriod: prevDate.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    currentExpenses: Math.round(curExpense),
    previousExpenses: Math.round(prevExpense),
    difference: Math.round(expenseDiff),
    percentageChange: expensePercentageChange,
    trend: expenseDiff > 0 ? 'increased' : expenseDiff < 0 ? 'decreased' : 'unchanged',
    categoryDeltas,
  };
};

/**
 * Affordability Analysis for a planned purchase
 *
 * Examines:
 * - Current net balance
 * - Recorded bank balances
 * - Upcoming unpaid bills due in next 30 days
 * - Projected remaining essential expenses for the month
 * - Impact on overall and category budgets
 */
export const analyzeAffordability = ({
  amount,
  itemDescription = 'Planned Purchase',
  category = 'Discretionary',
  transactions = [],
  bills = [],
  budgets = [],
  bankAccounts = [],
}) => {
  const purchaseAmount = Math.max(0, Number(amount) || 0);

  // 1. Calculate overall cash balance from transactions
  let totalIncome = 0;
  let totalExpense = 0;
  let curMonthIncome = 0;
  let curMonthExpense = 0;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  transactions.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') totalIncome += amt;
    if (t.type === 'expense') totalExpense += amt;

    if (t.date) {
      const d = new Date(t.date);
      if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
        if (t.type === 'income') curMonthIncome += amt;
        if (t.type === 'expense') curMonthExpense += amt;
      }
    }
  });

  const netLedgerBalance = totalIncome - totalExpense;

  // 2. Sum recorded bank account balances
  const recordedBankBalance = bankAccounts.reduce(
    (sum, a) => sum + (Number(a.balance) || 0),
    0
  );

  // Effective liquid reference (prefer ledger balance if transactions exist, else bank balances)
  const availableFunds = netLedgerBalance !== 0 ? netLedgerBalance : recordedBankBalance;

  // 3. Upcoming pending/overdue bills within next 30 days
  const todayStr = now.toISOString().split('T')[0];
  const upcomingBills = bills.filter(
    (b) => b.status === 'pending' || b.status === 'overdue'
  );
  const totalUpcomingBills = upcomingBills.reduce(
    (sum, b) => sum + (Number(b.amount) || 0),
    0
  );

  // 4. Projected remaining essential expenses for month
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const daysPassed = Math.max(1, now.getDate());
  const daysRemaining = daysInMonth - daysPassed;
  const dailyBurn = curMonthExpense / daysPassed;
  const projectedRemainingSpend = dailyBurn * daysRemaining;

  // 5. Safe surplus calculation
  const safeReserveNeeded = totalUpcomingBills + projectedRemainingSpend;
  const safeDisposableSurplus = availableFunds - safeReserveNeeded;
  const balanceAfterPurchase = availableFunds - purchaseAmount;
  const surplusAfterPurchase = safeDisposableSurplus - purchaseAmount;

  // 6. Category budget check if applicable
  const targetBudget = budgets.find(
    (b) => b.category && b.category.toLowerCase() === category.toLowerCase()
  );
  let budgetRemaining = null;
  let willExceedBudget = false;

  if (targetBudget) {
    const allocated = Number(targetBudget.allocated || targetBudget.amount) || 0;
    // Current category spend this month
    let curCatSpend = 0;
    transactions.forEach((t) => {
      if (t.type === 'expense' && t.category === targetBudget.category && t.date) {
        const d = new Date(t.date);
        if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
          curCatSpend += Number(t.amount) || 0;
        }
      }
    });
    budgetRemaining = allocated - curCatSpend;
    willExceedBudget = curCatSpend + purchaseAmount > allocated;
  }

  // 7. Determine affordability status
  let status = 'affordable';
  let score = 90;
  let reason = '';

  if (purchaseAmount > availableFunds) {
    status = 'unaffordable';
    score = 15;
    reason = `Purchase amount (₹${purchaseAmount.toLocaleString('en-IN')}) exceeds total available balance (₹${availableFunds.toLocaleString('en-IN')}).`;
  } else if (surplusAfterPurchase < 0) {
    status = 'caution';
    score = 45;
    reason = `While you have enough raw balance, this purchase will cut into funds reserved for upcoming bills (₹${totalUpcomingBills.toLocaleString('en-IN')}) and estimated month-end living expenses (₹${Math.round(projectedRemainingSpend).toLocaleString('en-IN')}).`;
  } else if (willExceedBudget) {
    status = 'stretch';
    score = 65;
    reason = `Affordable within your overall savings, but it will exceed your monthly ${category} budget by ₹${Math.round(purchaseAmount - (budgetRemaining || 0)).toLocaleString('en-IN')}.`;
  } else {
    status = 'affordable';
    score = 95;
    reason = `Easily affordable. Even after paying ₹${purchaseAmount.toLocaleString('en-IN')}, you maintain a healthy buffer of ₹${Math.round(surplusAfterPurchase).toLocaleString('en-IN')} after accounting for all upcoming bills and remaining month expenses.`;
  }

  return {
    itemDescription,
    purchaseAmount,
    availableFunds: Math.round(availableFunds),
    upcomingBillsAmount: Math.round(totalUpcomingBills),
    projectedRemainingSpend: Math.round(projectedRemainingSpend),
    safeDisposableSurplus: Math.round(safeDisposableSurplus),
    balanceAfterPurchase: Math.round(balanceAfterPurchase),
    surplusAfterPurchase: Math.round(surplusAfterPurchase),
    status,
    score,
    reason,
    categoryBudget: targetBudget
      ? {
          category: targetBudget.category,
          allocated: Number(targetBudget.allocated || targetBudget.amount),
          willExceed: willExceedBudget,
        }
      : null,
  };
};

/**
 * Identify actionable savings opportunities
 */
export const identifySavingsOpportunities = (transactions, budgets = []) => {
  const opportunities = [];

  // 1. Check budget overruns
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  const categorySpends = {};
  (transactions || []).forEach((t) => {
    if (t.type === 'expense' && t.date) {
      const d = new Date(t.date);
      if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
        const cat = t.category || 'General';
        categorySpends[cat] = (categorySpends[cat] || 0) + (Number(t.amount) || 0);
      }
    }
  });

  budgets.forEach((b) => {
    if (b.category === 'Overall') return;
    const allocated = Number(b.allocated || b.amount) || 0;
    const spent = categorySpends[b.category] || 0;

    if (spent > allocated && allocated > 0) {
      opportunities.push({
        type: 'budget_overrun',
        category: b.category,
        overspentAmount: Math.round(spent - allocated),
        allocated,
        spent: Math.round(spent),
        potentialMonthlySaving: Math.round(spent - allocated),
        recommendation: `Spending in ${b.category} is ₹${Math.round(spent - allocated).toLocaleString('en-IN')} over budget. Limiting this category back to ₹${allocated.toLocaleString('en-IN')} protects your monthly savings.`,
      });
    }
  });

  // 2. Identify top discretionary categories
  const discretionaryCategories = ['Food', 'Dining', 'Entertainment', 'Shopping', 'Personal Care', 'Travel'];
  discretionaryCategories.forEach((cat) => {
    const spent = categorySpends[cat] || 0;
    if (spent >= 3000) {
      const trimAmount = Math.round(spent * 0.15);
      opportunities.push({
        type: 'discretionary_trim',
        category: cat,
        spent: Math.round(spent),
        potentialMonthlySaving: trimAmount,
        recommendation: `Reducing ${cat} spending by 15% would save approximately ₹${trimAmount.toLocaleString('en-IN')} this month without impacting essential bills.`,
      });
    }
  });

  return opportunities;
};

