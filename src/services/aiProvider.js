import { toolDefinitions, executeTool } from './aiTools.js';
import { aiMemory } from './aiMemory.js';
import { aiStore } from './aiStore.js';
import {
  classifyFinancialIntent,
  resolveConversationContext,
  computeMultiMonthSummary,
  explainExpenseIncrease,
  extractAmountAndItem,
} from './aiReasoning.js';

/**
 * Clean LLM Provider Abstraction
 * Supports Google Gemini, OpenAI, and built-in Financial Intelligence Orchestrator.
 */

// Helper to sanitize system prompt with user context
const buildSystemPrompt = (user, memorySummary) => `You are FinTrack AI, an advanced adaptive personal financial intelligence assistant for FinTrack PRO.
You analyze real-time financial data for ${user.name || 'the user'}, track cash flow in Indian Rupees (₹), detect trends, and offer personalized, data-backed financial guidance.

USER CONTEXT & ADAPTIVE MEMORY:
${memorySummary}

CORE OPERATING PRINCIPLES:
1. Always use available tools to retrieve the user's actual financial data before answering questions about transactions, balances, spending, bills, or budgets. Never invent or hallucinate financial numbers.
2. All monetary values must be represented in Indian Rupees with ₹ symbol (e.g. ₹5,400).
3. If the user asks whether they can afford a purchase, always invoke 'analyzeAffordability' to compute impact against upcoming bills and monthly burn rate.
4. If the user asks to create or change a budget, transaction, or bill, invoke 'proposeAction'. Explain what action has been prepared and that they can confirm it with the action card. Do not claim you mutated the database directly.
5. Manually recorded bank balances are user-recorded, not live automatic bank syncs. Clarify this when discussing bank accounts.
6. Base suggestions strictly on the user's actual situation and avoid generic advice.
7. Be concise, transparent, and structured. Highlight key figures, dates, and actionable takeaways.`;

/**
 * Local Financial Reasoning & Tool Orchestrator
 * Analyzes natural language intent, dynamically selects and executes tools,
 * and formats comprehensive financial responses with interactive insight cards.
 */
export const runLocalOrchestrator = async ({ message, user, memoryContext, conversationId }) => {
  const toolsExecuted = [];
  const insights = [];
  const proposals = [];
  let answer = '';
  let followUps = [];

  // 1. Fetch past conversation turns to preserve multi-turn context
  const pastMessages = conversationId ? await aiStore.getMessages(user.id, conversationId) : [];
  // Exclude current message (which was saved immediately before processAIChat)
  const previousTurns = pastMessages.filter((m) => m.content !== message);
  const context = resolveConversationContext(previousTurns);

  // 2. Classify natural language intent using semantic context
  const parsed = classifyFinancialIntent(message, context);
  console.log(`[AI Orchestrator] 🎯 Intent: ${parsed.intent}${parsed.isFollowUp ? ' (Context Follow-Up)' : ''}`);

  // -------------------------------------------------------------
  // INTENT 1: WHERE DID MOST OF MY MONEY GO / SPENDING BREAKDOWN
  // -------------------------------------------------------------
  if (parsed.intent === 'WHERE_DID_MONEY_GO') {
    const timeWin = parsed.timeWindow || { label: 'this month' };
    const now = new Date();
    const catArgs = timeWin.month !== undefined && timeWin.year !== undefined
      ? { month: timeWin.month, year: timeWin.year }
      : timeWin.startDate && timeWin.endDate
      ? { startDate: timeWin.startDate, endDate: timeWin.endDate }
      : { month: now.getMonth(), year: now.getFullYear() };

    const [catRes, topTxsRes] = await Promise.all([
      executeTool('getSpendingByCategory', catArgs, user.id, conversationId),
      executeTool('searchTransactions', { type: 'expense', sortBy: 'amount', limit: 3, startDate: catArgs.startDate, endDate: catArgs.endDate }, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getSpendingByCategory', args: catArgs, result: catRes },
      { tool: 'searchTransactions', args: { type: 'expense', sortBy: 'amount', limit: 3 }, result: topTxsRes }
    );

    insights.push({
      type: 'category_breakdown_card',
      title: `Where Your Money Went (${timeWin.label})`,
      data: catRes,
    });

    const breakdown = catRes.breakdown || [];
    const topCat = breakdown[0];
    const secondCat = breakdown[1];
    const thirdCat = breakdown[2];
    const topTx = topTxsRes.transactions?.[0];

    if (topCat) {
      answer = `### Where Your Money Went (${timeWin.label})\n\n` +
        `Based on your recorded transactions for **${timeWin.label}**, your highest spending category is **${topCat.category}** at **₹${topCat.amount.toLocaleString('en-IN')}**, accounting for **${topCat.percentage}%** of your total tracked expenses (₹${catRes.totalExpense.toLocaleString('en-IN')}).\n\n` +
        `**Top Spending Categories:**\n` +
        `• **${topCat.category}:** ₹${topCat.amount.toLocaleString('en-IN')} (${topCat.percentage}%)\n` +
        (secondCat ? `• **${secondCat.category}:** ₹${secondCat.amount.toLocaleString('en-IN')} (${secondCat.percentage}%)\n` : '') +
        (thirdCat ? `• **${thirdCat.category}:** ₹${thirdCat.amount.toLocaleString('en-IN')} (${thirdCat.percentage}%)\n` : '') +
        (topTx ? `\n**Largest Single Expense:**\nYour biggest single debit was **${topTx.title}** (${topTx.category}) for **₹${Number(topTx.amount).toLocaleString('en-IN')}** on ${topTx.date}.\n\n` : '\n') +
        `💡 **Recommendation:** Trimming ~₹${Math.round(topCat.amount * 0.15).toLocaleString('en-IN')} from ${topCat.category} would immediately improve your monthly savings.`;

      followUps = [
        `Show all ${topCat.category} transactions`,
        'Compare this month with last month',
        'Which expenses can I reduce?',
      ];
    } else {
      answer = `No expense transactions have been recorded for **${timeWin.label}**. Start by adding your recent purchases to track your spending breakdown.`;
      followUps = ['Show my dashboard summary', 'Check upcoming bills'];
    }
  }

  // -------------------------------------------------------------
  // INTENT 2: CATEGORY SPENDING (e.g. food last week, what about last month?)
  // -------------------------------------------------------------
  else if (parsed.intent === 'CATEGORY_SPENDING') {
    const targetCategory = parsed.category || context.lastCategory || 'Food';
    const timeWin = parsed.timeWindow || { label: 'this month' };

    const searchArgs = {
      category: targetCategory,
      type: 'expense',
      startDate: timeWin.startDate,
      endDate: timeWin.endDate,
      limit: 25,
      sortBy: 'date',
    };

    const [txsRes, catRes] = await Promise.all([
      executeTool('searchTransactions', searchArgs, user.id, conversationId),
      executeTool('getSpendingByCategory', { startDate: timeWin.startDate, endDate: timeWin.endDate }, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'searchTransactions', args: searchArgs, result: txsRes },
      { tool: 'getSpendingByCategory', args: {}, result: catRes }
    );

    const txs = txsRes.transactions || [];
    const totalSpent = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const overallTotal = catRes.totalExpense || totalSpent;
    const pct = overallTotal > 0 ? Number(((totalSpent / overallTotal) * 100).toFixed(1)) : 0;

    insights.push({
      type: 'recent_transactions_card',
      title: `${targetCategory} Expenses (${timeWin.label})`,
      data: { count: txs.length, transactions: txs },
    });

    if (totalSpent > 0) {
      answer = `### ${targetCategory} Spending (${timeWin.label})\n\n` +
        `You spent **₹${totalSpent.toLocaleString('en-IN')}** on **${targetCategory}** ${timeWin.label}` +
        ` across **${txs.length}** recorded transaction${txs.length > 1 ? 's' : ''}` +
        (pct > 0 ? ` (${pct}% of your total recorded expenses of ₹${overallTotal.toLocaleString('en-IN')}).` : '.') +
        `\n\n` +
        (txs.length > 0
          ? `**Recent Debits:**\n` +
            txs
              .slice(0, 4)
              .map((t) => `• **${t.title}**: ₹${Number(t.amount).toLocaleString('en-IN')} on ${t.date}`)
              .join('\n')
          : '');

      followUps = [
        `Why did ${targetCategory} spending change?`,
        'What about last month?',
        'Which expenses can I reduce?',
      ];
    } else {
      answer = `You had **zero recorded expenses** in **${targetCategory}** ${timeWin.label}.\n\nTotal tracked expenses across all categories for this period was **₹${overallTotal.toLocaleString('en-IN')}**.`;
      followUps = [
        'Where did most of my money go this month?',
        'Show top 5 largest transactions',
        'Compare this month with last month',
      ];
    }
  }

  // -------------------------------------------------------------
  // INTENT 3: WHY DID EXPENSES INCREASE (Causal Analysis)
  // -------------------------------------------------------------
  else if (parsed.intent === 'WHY_EXPENSES_INCREASED') {
    const targetCat = parsed.category || context.lastCategory || null;
    const causal = await explainExpenseIncrease(user.id, conversationId, targetCat);

    toolsExecuted.push({ tool: 'compareMonthlySpending', args: {}, result: causal.comparison });

    insights.push({
      type: 'comparison_card',
      title: targetCat ? `${targetCat} Spending Surge Analysis` : 'Monthly Expense Surge Drivers',
      data: causal.comparison,
    });

    if (causal.type === 'category' && targetCat) {
      answer = `### Root Cause: Why ${targetCat} Spending Increased\n\n` +
        `Your spending on **${targetCat}** rose by **₹${Math.abs(causal.difference).toLocaleString('en-IN')}** (**${causal.percentageChange > 0 ? '+' : ''}${causal.percentageChange}%**) compared to last month` +
        ` (₹${causal.currentTotal.toLocaleString('en-IN')} this month vs ₹${causal.previousTotal.toLocaleString('en-IN')} last month).\n\n` +
        (causal.topTransactions && causal.topTransactions.length > 0
          ? `**Primary Spending Drivers:**\n` +
            causal.topTransactions
              .map((t) => `• **${t.title}**: ₹${Number(t.amount).toLocaleString('en-IN')} on ${t.date}`)
              .join('\n') + `\n\n`
          : '') +
        `💡 **Recommendation:** Setting a monthly ${targetCat} limit of ₹${Math.round((causal.previousTotal || causal.currentTotal * 0.8) * 1.1).toLocaleString('en-IN')} would help prevent future overages.`;

      followUps = [
        `Set a budget for ${targetCat}`,
        'Which expenses can I reduce?',
        'What are my five largest transactions?',
      ];
    } else {
      const isUp = causal.difference > 0;
      answer = `### Analysis: Expense Drivers & Trends\n\n` +
        `Your recorded monthly expenses ${isUp ? 'increased' : 'changed'} by **₹${Math.abs(causal.difference).toLocaleString('en-IN')}** (**${causal.percentageChange > 0 ? '+' : ''}${causal.percentageChange}%**) compared to last month.\n\n` +
        (causal.spikingCategories && causal.spikingCategories.length > 0
          ? `**Key Categories Driving the Surge:**\n` +
            causal.spikingCategories
              .map((c) => `• **${c.category}**: +₹${c.difference.toLocaleString('en-IN')} (+${c.percentageChange}%) to ₹${c.current.toLocaleString('en-IN')}`)
              .join('\n') + `\n\n`
          : '') +
        (causal.largestRecentExpenses && causal.largestRecentExpenses.length > 0
          ? `**Largest Recent Transactions:**\n` +
            causal.largestRecentExpenses
              .map((t) => `• **${t.title}** (${t.category}): ₹${Number(t.amount).toLocaleString('en-IN')} on ${t.date}`)
              .join('\n') + `\n\n`
          : '') +
        `💡 **Action Step:** Review discretionary spending in ${causal.spikingCategories?.[0]?.category || 'top categories'} to curb further expansion.`;

      followUps = [
        'Which expenses can I reduce?',
        `What about ${causal.spikingCategories?.[0]?.category || 'Food'}?`,
        'Show my top 5 largest transactions',
      ];
    }
  }

  // -------------------------------------------------------------
  // INTENT 4: AM I SPENDING TOO MUCH COMPARED TO MY INCOME?
  // -------------------------------------------------------------
  else if (parsed.intent === 'INCOME_VS_EXPENSES') {
    const summary = await executeTool('getDashboardSummary', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'getDashboardSummary', args: {}, result: summary });

    insights.push({
      type: 'financial_health_card',
      title: 'Income vs Expense Cash Flow',
      data: summary,
    });

    const income = summary.totalIncome || 0;
    const expenses = summary.totalExpenses || 0;
    const ratio = income > 0 ? Number(((expenses / income) * 100).toFixed(1)) : 100;
    const savingsRate = summary.savingsRate || 0;

    let verdict = '';
    let advice = '';
    if (ratio <= 50) {
      verdict = `✅ **Excellent Cash Flow:** You are spending only **${ratio}%** of your recorded income, retaining a high savings rate of **${savingsRate}%**.`;
      advice = 'Your spending is comfortably below the standard 50% needs ceiling of the 50/30/20 rule. Consider allocating extra surplus into long-term investments or emergency reserves.';
    } else if (ratio <= 75) {
      verdict = `⚠️ **Moderate Balance:** You are spending **${ratio}%** of your recorded income, saving **${savingsRate}%**.`;
      advice = 'You are maintaining a positive surplus, but approaching the upper threshold. Monitoring discretionary dining and shopping will keep your savings safe.';
    } else if (ratio <= 100) {
      verdict = `🚨 **High Spending Alert:** You are consuming **${ratio}%** of your income, leaving very little savings buffer (${savingsRate}%).`;
      advice = 'Expenses are running close to total earnings. Trimming non-essential subscriptions and shopping is recommended immediately.';
    } else {
      verdict = `🛑 **Deficit Warning:** Your expenses exceed recorded income by ₹${Math.abs(summary.totalBalance).toLocaleString('en-IN')}.`;
      advice = 'You are in a net-negative cashflow position. Immediate budget reductions are necessary to avoid drawing on debt or emergency funds.';
    }

    answer = `### Cash Flow Evaluation: Spending vs Income\n\n${verdict}\n\n` +
      `- **Total Recorded Income:** ₹${income.toLocaleString('en-IN')}\n` +
      `- **Total Recorded Expenses:** ₹${expenses.toLocaleString('en-IN')}\n` +
      `- **Net Surplus Remaining:** **₹${summary.totalBalance.toLocaleString('en-IN')}**\n` +
      `- **Net Savings Rate:** **${savingsRate}%**\n` +
      `- **Expense-to-Income Ratio:** **${ratio}%**\n\n` +
      `💡 **50/30/20 Guideline:**\n${advice}`;

    followUps = [
      'How much can I save this month?',
      'Where did most of my money go this month?',
      'Which expenses can I reduce?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 5: HOW MUCH CAN I SAVE THIS MONTH? (Savings Capacity)
  // -------------------------------------------------------------
  else if (parsed.intent === 'SAVINGS_CAPACITY') {
    const [summary, proj, opps] = await Promise.all([
      executeTool('getDashboardSummary', {}, user.id, conversationId),
      executeTool('estimateMonthEndSpending', {}, user.id, conversationId),
      executeTool('identifySavingsOpportunities', {}, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getDashboardSummary', args: {}, result: summary },
      { tool: 'estimateMonthEndSpending', args: {}, result: proj },
      { tool: 'identifySavingsOpportunities', args: {}, result: opps }
    );

    insights.push({
      type: 'projection_card',
      title: 'Projected Savings Capacity',
      data: proj,
    });

    const income = summary.totalIncome || 0;
    const projectedExp = proj.projectedTotalExpense || summary.totalExpenses || 0;
    const estSavings = Math.max(0, income - projectedExp);
    const estSavingsRate = income > 0 ? Math.round((estSavings / income) * 100) : 0;

    answer = `### Monthly Savings Capacity Forecast\n\n` +
      `Based on your daily average burn rate of **₹${proj.dailyBurnRate.toLocaleString('en-IN')}/day** across ${proj.currentDay} days elapsed:\n\n` +
      `- **Total Monthly Income:** ₹${income.toLocaleString('en-IN')}\n` +
      `- **Current Spent So Far:** ₹${proj.actualExpenseSoFar.toLocaleString('en-IN')}\n` +
      `- **Projected Month-End Outflow:** **₹${projectedExp.toLocaleString('en-IN')}**\n` +
      `- **Estimated Baseline Net Savings:** **₹${estSavings.toLocaleString('en-IN')}** (~${estSavingsRate}% savings rate)\n\n` +
      (opps.length > 0
        ? `**Potential Extra Trims Identified:**\n` +
          opps.slice(0, 2).map((o) => `• **${o.category}**: ${o.recommendation}`).join('\n') + `\n\n`
        : '') +
      `💡 **Verdict:** You have the capacity to safely set aside **₹${estSavings.toLocaleString('en-IN')}** this month without compromising routine living expenses.`;

    followUps = [
      'Which expenses can I reduce?',
      'Can I afford a planned purchase?',
      'Show my recurring subscriptions',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 6: WHICH EXPENSES CAN I REDUCE?
  // -------------------------------------------------------------
  else if (parsed.intent === 'REDUCE_EXPENSES') {
    const [opps, rec, catRes] = await Promise.all([
      executeTool('identifySavingsOpportunities', {}, user.id, conversationId),
      executeTool('detectRecurringExpenses', {}, user.id, conversationId),
      executeTool('getSpendingByCategory', {}, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'identifySavingsOpportunities', args: {}, result: opps },
      { tool: 'detectRecurringExpenses', args: {}, result: rec },
      { tool: 'getSpendingByCategory', args: {}, result: catRes }
    );

    insights.push({
      type: 'savings_opportunities_card',
      title: 'Actionable Cost-Reduction Plan',
      data: opps,
    });

    const topDiscretionary = (catRes.breakdown || []).filter(
      (b) => ['Food', 'Dining', 'Shopping', 'Entertainment', 'Travel'].includes(b.category)
    );

    answer = `### Actionable Expense Reduction Plan\n\n` +
      `To optimize your monthly surplus, here are targeted areas where you can trim spending with minimal lifestyle friction:\n\n` +
      (opps && opps.length > 0
        ? opps.map((o) => `🎯 **${o.category}**: ${o.recommendation}`).join('\n\n') + '\n\n'
        : '') +
      (rec.items && rec.items.length > 0
        ? `**Recurring Subscriptions to Review:**\n` +
          rec.items.slice(0, 3).map((r) => `• **${r.title}**: ₹${r.amount.toLocaleString('en-IN')}/mo (audit if still actively used)`).join('\n') + '\n\n'
        : '') +
      (topDiscretionary.length > 0
        ? `**Discretionary Spending Targets:**\n` +
          topDiscretionary.slice(0, 2).map((d) => `• **${d.category}** (₹${d.amount.toLocaleString('en-IN')} total): Aim for a 15% reduction to save ~₹${Math.round(d.amount * 0.15).toLocaleString('en-IN')}/month.`).join('\n')
        : '');

    followUps = [
      'How much can I save this month?',
      'Set a monthly food budget of ₹6,000',
      'What are my recurring subscriptions?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 7: TOP TRANSACTIONS (e.g. what are my five largest transactions?)
  // -------------------------------------------------------------
  else if (parsed.intent === 'TOP_TRANSACTIONS') {
    const limit = parsed.limit || 5;
    const type = parsed.type || 'expense';

    const searchRes = await executeTool(
      'searchTransactions',
      { type, sortBy: 'amount', limit },
      user.id,
      conversationId
    );
    toolsExecuted.push({ tool: 'searchTransactions', args: { type, sortBy: 'amount', limit }, result: searchRes });

    insights.push({
      type: 'recent_transactions_card',
      title: `Top ${limit} Largest ${type === 'expense' ? 'Expenses' : 'Transactions'}`,
      data: searchRes,
    });

    const txs = searchRes.transactions || [];
    answer = `### Top ${limit} Largest ${type === 'expense' ? 'Recorded Expenses' : 'Transactions'}\n\n` +
      (txs.length > 0
        ? txs
            .map((t, idx) => `${idx + 1}. **${t.title}** (${t.category || 'General'}): **₹${Number(t.amount).toLocaleString('en-IN')}** on ${t.date}`)
            .join('\n') + `\n\n` +
          `Total of these ${txs.length} transactions: **₹${txs.reduce((sum, t) => sum + Number(t.amount || 0), 0).toLocaleString('en-IN')}**.`
        : `No transactions found in your records.`);

    followUps = [
      'Where did most of my money go this month?',
      'Which expenses can I reduce?',
      'Compare this month with last month',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 8: MULTI-MONTH TREND (e.g. last 3 months)
  // -------------------------------------------------------------
  else if (parsed.intent === 'MULTI_MONTH_TREND') {
    const monthsCount = parsed.monthsCount || 3;
    const multiData = await computeMultiMonthSummary(user.id, conversationId, monthsCount);

    const comp = await executeTool('compareMonthlySpending', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'compareMonthlySpending', args: {}, result: comp });

    insights.push({
      type: 'comparison_card',
      title: `${monthsCount}-Month Cash Flow Trend`,
      data: { periods: multiData, comparison: comp },
    });

    answer = `### ${monthsCount}-Month Cash Flow Comparison\n\n` +
      `Here is your month-by-month income, expense, and savings trajectory:\n\n` +
      multiData
        .map(
          (m) =>
            `**${m.monthLabel}:**\n` +
            `• Income: ₹${m.income.toLocaleString('en-IN')} | Expenses: ₹${m.expense.toLocaleString('en-IN')}\n` +
            `• Net Savings: **₹${m.netSavings.toLocaleString('en-IN')}** (Savings Rate: **${m.savingsRate}%**)\n` +
            (m.topCategory ? `• Top Category: ${m.topCategory.name} (₹${m.topCategory.amount.toLocaleString('en-IN')})\n` : '')
        )
        .join('\n') +
      `\n💡 **Trajectory:** Your net savings rate is currently **${comp.percentageChange > 0 ? 'expanding' : 'stabilizing'}** across periods.`;

    followUps = [
      'Why are my expenses increasing?',
      'How much can I save this month?',
      'Show my category breakdown',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 9: MONTHLY COMPARISON (e.g. this month vs last month)
  // -------------------------------------------------------------
  else if (parsed.intent === 'MONTHLY_COMPARISON') {
    const comp = await executeTool('compareMonthlySpending', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'compareMonthlySpending', args: {}, result: comp });

    insights.push({
      type: 'comparison_card',
      title: `${comp.currentPeriod} vs ${comp.previousPeriod} Spending`,
      data: comp,
    });

    answer = `### Monthly Spending Comparison\n\n` +
      `In **${comp.currentPeriod}**, your total recorded expenses are **₹${comp.currentExpenses.toLocaleString('en-IN')}**, compared to **₹${comp.previousExpenses.toLocaleString('en-IN')}** in **${comp.previousPeriod}**.\n\n` +
      `- **Change:** ₹${Math.abs(comp.difference).toLocaleString('en-IN')} (${comp.percentageChange > 0 ? '+' : ''}${comp.percentageChange}%)\n` +
      `- **Trend:** Spending has ${comp.trend}.\n\n` +
      (comp.categoryDeltas && comp.categoryDeltas.length > 0
        ? `**Top Shifts by Category:**\n` +
          comp.categoryDeltas
            .slice(0, 3)
            .map(
              (c) =>
                `• **${c.category}:** ₹${c.current.toLocaleString('en-IN')} (${c.percentageChange > 0 ? '+' : ''}${c.percentageChange}% vs last month)`
            )
            .join('\n')
        : 'Category-level records are identical across periods.');

    followUps = [
      'Show my category breakdown',
      'Where can I cut expenses?',
      'Estimate my month-end spending',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 10: PURCHASE AFFORDABILITY (e.g. Can I afford a new phone worth ₹25,000?)
  // -------------------------------------------------------------
  else if (parsed.intent === 'AFFORDABILITY') {
    const { amount, item } = parsed.amount > 0 ? parsed : extractAmountAndItem(message);

    if (amount > 0) {
      const toolRes = await executeTool(
        'analyzeAffordability',
        { amount, itemDescription: item || message },
        user.id,
        conversationId
      );
      toolsExecuted.push({ tool: 'analyzeAffordability', args: { amount }, result: toolRes });

      insights.push({
        type: 'affordability_meter',
        title: `Affordability Assessment: ₹${amount.toLocaleString('en-IN')}`,
        status: toolRes.status,
        score: toolRes.score,
        data: toolRes,
      });

      answer = `### Affordability Analysis for ${item} (₹${amount.toLocaleString('en-IN')})\n\n${toolRes.reason}\n\n` +
        `- **Available Balance:** ₹${toolRes.availableFunds.toLocaleString('en-IN')}\n` +
        `- **Reserved for Upcoming Bills:** ₹${toolRes.upcomingBillsAmount.toLocaleString('en-IN')}\n` +
        `- **Projected Remaining Month Expenses:** ₹${toolRes.projectedRemainingSpend.toLocaleString('en-IN')}\n` +
        `- **Safe Disposable Buffer After Purchase:** ₹${toolRes.surplusAfterPurchase.toLocaleString('en-IN')}\n\n` +
        (toolRes.status === 'affordable'
          ? `✅ **Verdict:** You can proceed comfortably without endangering upcoming payments.`
          : toolRes.status === 'caution'
          ? `⚠️ **Verdict:** Proceed with caution. You have enough raw balance, but this leaves little cushion for bills or unexpected costs.`
          : `🛑 **Verdict:** Not recommended at this time, as it exceeds safe available reserves.`);

      followUps = [
        'How can I save more this month?',
        'What are my upcoming bills?',
        'Show my spending breakdown',
      ];
    } else {
      answer = `To evaluate affordability accurately, please specify the approximate cost of the item in Indian Rupees (₹). For example: *"Can I afford a new phone worth ₹25,000?"*`;
      followUps = ['Can I afford a ₹10,000 purchase?', 'What is my current net balance?'];
    }
  }

  // -------------------------------------------------------------
  // INTENT 11: EXPLAIN MY CURRENT FINANCIAL SITUATION (Holistic Diagnostic)
  // -------------------------------------------------------------
  else if (parsed.intent === 'EXPLAIN_FINANCIAL_SITUATION') {
    const [summary, budgetsRes, billsRes, anomaliesRes] = await Promise.all([
      executeTool('getDashboardSummary', {}, user.id, conversationId),
      executeTool('getBudgets', {}, user.id, conversationId),
      executeTool('getBills', { status: 'all' }, user.id, conversationId),
      executeTool('detectAnomalousExpenses', {}, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getDashboardSummary', args: {}, result: summary },
      { tool: 'getBudgets', args: {}, result: budgetsRes },
      { tool: 'getBills', args: {}, result: billsRes },
      { tool: 'detectAnomalousExpenses', args: {}, result: anomaliesRes }
    );

    insights.push({
      type: 'financial_health_card',
      title: 'Comprehensive Financial Health Report',
      data: summary,
    });

    const pendingBills = (billsRes.bills || []).filter((b) => b.status === 'pending' || b.status === 'overdue');
    const overBudgets = (budgetsRes.budgets || []).filter((b) => b.spent > b.allocated);

    answer = `### Comprehensive Financial Situation Report\n\n` +
      `Hello ${user.name || 'there'}! Here is an objective diagnostic of your current financial standing:\n\n` +
      `**1. Cash Flow & Liquidity:**\n` +
      `- **Total Recorded Income:** ₹${summary.totalIncome.toLocaleString('en-IN')}\n` +
      `- **Total Tracked Expenses:** ₹${summary.totalExpenses.toLocaleString('en-IN')}\n` +
      `- **Net Cash Balance:** **₹${summary.totalBalance.toLocaleString('en-IN')}**\n` +
      `- **Net Savings Rate:** **${summary.savingsRate}%** (${summary.savingsRate >= 50 ? 'Strong & Healthy' : 'Moderate'})\n\n` +
      `**2. Obligations & Liabilities:**\n` +
      `- **Pending Bills:** **₹${billsRes.pendingTotal.toLocaleString('en-IN')}** across ${pendingBills.length} upcoming bill${pendingBills.length !== 1 ? 's' : ''}.\n\n` +
      `**3. Budget Adherence:**\n` +
      (overBudgets.length > 0
        ? `⚠️ ${overBudgets.length} category budget${overBudgets.length > 1 ? 's' : ''} currently exceeded (${overBudgets.map((b) => b.category).join(', ')}).\n\n`
        : `✅ All active category budgets are within their allocated spending ceilings.\n\n`) +
      `**4. Strategic Guidance:**\n` +
      `Your cash flow maintains a healthy surplus. Focus on clearing the ₹${billsRes.pendingTotal.toLocaleString('en-IN')} pending bill reserve while maintaining your ${summary.savingsRate}% savings trajectory.`;

    followUps = [
      'Where did most of my money go this month?',
      'Can I afford a ₹15,000 purchase?',
      'Show my pending bills',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 12: BILLS AND UTILITIES
  // -------------------------------------------------------------
  else if (parsed.intent === 'BILLS_AND_UTILITIES') {
    const billsRes = await executeTool('getBills', { status: 'all' }, user.id, conversationId);
    toolsExecuted.push({ tool: 'getBills', args: {}, result: billsRes });

    insights.push({
      type: 'bills_summary_card',
      title: 'Upcoming & Active Bills',
      data: billsRes,
    });

    const pending = (billsRes.bills || []).filter((b) => b.status === 'pending' || b.status === 'overdue');

    answer = `### Bills & Utilities Overview\n\n` +
      `You have **${billsRes.totalBills}** tracked bills, with **₹${billsRes.pendingTotal.toLocaleString('en-IN')}** currently pending or overdue.\n\n` +
      (pending.length > 0
        ? `**Upcoming Deadlines:**\n` +
          pending
            .slice(0, 5)
            .map((b) => `• **${b.provider}** (${b.billType}): ₹${b.amount.toLocaleString('en-IN')} — Due ${b.dueDate} [${b.status.toUpperCase()}]`)
            .join('\n')
        : `🎉 You have zero pending or overdue bills at this time!`);

    followUps = [
      'Can I afford my upcoming bills?',
      'Check recurring subscriptions',
      'Show my dashboard overview',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 13: RECURRING SUBSCRIPTIONS
  // -------------------------------------------------------------
  else if (parsed.intent === 'RECURRING_SUBSCRIPTIONS') {
    const recRes = await executeTool('detectRecurringExpenses', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'detectRecurringExpenses', args: {}, result: recRes });

    insights.push({
      type: 'recurring_card',
      title: 'Detected Subscriptions & Recurring Commitments',
      data: recRes,
    });

    answer = `### Recurring Commitments & Subscriptions\n\n` +
      `Identified **${recRes.recurringCount}** recurring spending patterns totaling **₹${recRes.totalMonthlyCommitment.toLocaleString('en-IN')}/month** (~₹${(recRes.totalMonthlyCommitment * 12).toLocaleString('en-IN')}/year).\n\n` +
      (recRes.items && recRes.items.length > 0
        ? recRes.items
            .map((r) => `• **${r.title}** (${r.category}): ₹${r.amount.toLocaleString('en-IN')} / month (last paid ${r.lastChargedDate})`)
            .join('\n')
        : 'No clear recurring patterns detected in recent transactions.');

    followUps = [
      'Which expenses can I reduce?',
      'Show my bills',
      'What is my monthly burn rate?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 14: PROPOSE ACTION (Create budget)
  // -------------------------------------------------------------
  else if (parsed.intent === 'PROPOSE_ACTION') {
    const amount = parsed.amount || 5000;
    const category = parsed.category || 'Food';

    const prop = await executeTool(
      'proposeAction',
      {
        actionType: 'create_budget',
        details: { category, allocated: amount, name: `${category} Budget` },
        summary: `Set monthly ${category} budget limit to ₹${amount.toLocaleString('en-IN')}`,
      },
      user.id,
      conversationId
    );
    toolsExecuted.push({ tool: 'proposeAction', args: { actionType: 'create_budget' }, result: prop });
    proposals.push(prop);

    answer = `I have prepared a proposed budget update for you:\n\n` +
      `🎯 **Action:** Set monthly **${category}** budget limit to **₹${amount.toLocaleString('en-IN')}**.\n\n` +
      `To ensure security and user control, please review and click **Confirm & Apply** below to update your live budget table.`;

    followUps = ['Show current budgets', `Show ${category.toLowerCase()} spending this month`];
  }

  // -------------------------------------------------------------
  // INTENT 15: BANK BALANCES
  // -------------------------------------------------------------
  else if (parsed.intent === 'BANK_BALANCES') {
    const bankRes = await executeTool('getBankAccounts', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'getBankAccounts', args: {}, result: bankRes });

    insights.push({
      type: 'bank_accounts_card',
      title: 'Recorded Bank Accounts',
      data: bankRes,
    });

    const accounts = bankRes.accounts || [];
    answer = `### Recorded Bank Account Balances\n\n` +
      `You have **${accounts.length}** recorded bank account${accounts.length !== 1 ? 's' : ''} with a combined balance of **₹${bankRes.totalBalance.toLocaleString('en-IN')}**:\n\n` +
      (accounts.length > 0
        ? accounts
            .map((a) => `• **${a.bank_name}** (${a.account_type}): ₹${Number(a.balance).toLocaleString('en-IN')}`)
            .join('\n') + `\n\n`
        : 'No bank accounts recorded yet.\n\n') +
      `*Note: Balances shown are user-recorded figures from your FinTrack ledger.*`;

    followUps = [
      'Am I spending too much compared to my income?',
      'Can I afford a ₹10,000 purchase?',
      'Show my pending bills',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 16: NEGATIVE BALANCE EXPLANATION
  // -------------------------------------------------------------
  else if (parsed.intent === 'NEGATIVE_BALANCE') {
    const [summary, txsRes] = await Promise.all([
      executeTool('getDashboardSummary', {}, user.id, conversationId),
      executeTool('searchTransactions', { type: 'expense', limit: 5 }, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getDashboardSummary', args: {}, result: summary },
      { tool: 'searchTransactions', args: { type: 'expense', limit: 5 }, result: txsRes }
    );

    insights.push({
      type: 'financial_health_card',
      title: 'Ledger Deficit Diagnostic',
      data: summary,
    });

    const isDeficit = summary.totalBalance < 0;
    const topDebits = txsRes.transactions || [];

    if (isDeficit) {
      answer = `### Why Your Balance is Negative (Deficit Analysis)\n\n` +
        `Your current recorded ledger balance is **-₹${Math.abs(summary.totalBalance).toLocaleString('en-IN')}**. Here is the breakdown of why this occurred:\n\n` +
        `1. **Recorded Income: ₹${summary.totalIncome.toLocaleString('en-IN')}**\n` +
        (summary.totalIncome === 0
          ? `   *Notice:* No income transactions (salary, freelance, or transfers) have been logged yet in your account.\n`
          : `   Your total logged deposits are lower than your outgoing payments.\n`) +
        `2. **Total Tracked Expenses: ₹${summary.totalExpenses.toLocaleString('en-IN')}**\n` +
        `   You have recorded debits totaling ₹${summary.totalExpenses.toLocaleString('en-IN')}.\n` +
        `3. **Net Cashflow Deficit:**\n` +
        `   Since expenses (₹${summary.totalExpenses.toLocaleString('en-IN')}) exceed income (₹${summary.totalIncome.toLocaleString('en-IN')}), your ledger currently stands at **-₹${Math.abs(summary.totalBalance).toLocaleString('en-IN')}**.\n\n` +
        (topDebits.length > 0
          ? `**Recent Expenses Contributing to Deficit:**\n` +
            topDebits.slice(0, 4).map((t) => `• **${t.title}** (${t.category}): ₹${Number(t.amount).toLocaleString('en-IN')}`).join('\n') + `\n\n`
          : '') +
        `💡 **How to Balance Your Account:**\n` +
        `• Log your monthly salary or deposits in **Transactions** (+ Add Transaction → Type: Income).\n` +
        `• Or review the expenses listed above to verify their accuracy.`;
    } else {
      answer = `### Balance Status: Positive Surplus\n\n` +
        `Great news! Your recorded balance is currently **positive** at **₹${summary.totalBalance.toLocaleString('en-IN')}** (Total Income: ₹${summary.totalIncome.toLocaleString('en-IN')}, Expenses: ₹${summary.totalExpenses.toLocaleString('en-IN')}). You do not currently have a negative balance.`;
    }

    followUps = [
      'Where did most of my money go this month?',
      'What are my five largest transactions?',
      'Which expenses can I reduce?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 17: NET BALANCE
  // -------------------------------------------------------------
  else if (parsed.intent === 'NET_BALANCE') {
    const [summary, bankRes] = await Promise.all([
      executeTool('getDashboardSummary', {}, user.id, conversationId),
      executeTool('getBankAccounts', {}, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getDashboardSummary', args: {}, result: summary },
      { tool: 'getBankAccounts', args: {}, result: bankRes }
    );

    insights.push({
      type: 'financial_health_card',
      title: 'Current Net Balance',
      data: summary,
    });

    const isDeficit = summary.totalBalance < 0;
    answer = `### Current Net Balance: **${isDeficit ? `-₹${Math.abs(summary.totalBalance).toLocaleString('en-IN')}` : `₹${summary.totalBalance.toLocaleString('en-IN')}`}**\n\n` +
      `- **Total Recorded Income:** ₹${summary.totalIncome.toLocaleString('en-IN')}\n` +
      `- **Total Tracked Expenses:** ₹${summary.totalExpenses.toLocaleString('en-IN')}\n` +
      `- **Cash Flow Status:** ${isDeficit ? `⚠️ Net Deficit of ₹${Math.abs(summary.totalBalance).toLocaleString('en-IN')}` : `✅ Surplus of ₹${summary.totalBalance.toLocaleString('en-IN')}`}\n` +
      `- **Savings Rate:** ${summary.savingsRate}%\n\n` +
      (bankRes.totalBalance > 0
        ? `Additionally, your recorded bank accounts hold a combined total of **₹${bankRes.totalBalance.toLocaleString('en-IN')}** across ${bankRes.accounts.length} account(s).`
        : `*Track your bank deposits by logging income transactions or bank accounts.*`);

    followUps = [
      'Where did most of my money go this month?',
      'Why is my balance negative?',
      'What are my five largest transactions?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 18: TOTAL EXPENSES
  // -------------------------------------------------------------
  else if (parsed.intent === 'TOTAL_EXPENSES') {
    const timeWin = parsed.timeWindow || { label: 'this month' };
    const [catRes, txsRes] = await Promise.all([
      executeTool('getSpendingByCategory', { startDate: timeWin.startDate, endDate: timeWin.endDate }, user.id, conversationId),
      executeTool('searchTransactions', { type: 'expense', startDate: timeWin.startDate, endDate: timeWin.endDate, limit: 5 }, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getSpendingByCategory', args: {}, result: catRes },
      { tool: 'searchTransactions', args: {}, result: txsRes }
    );

    insights.push({
      type: 'category_breakdown_card',
      title: `Expense Breakdown (${timeWin.label})`,
      data: catRes,
    });

    const total = catRes.totalExpense || 0;
    const breakdown = catRes.breakdown || [];

    answer = `### Total Expenses (${timeWin.label}): **₹${total.toLocaleString('en-IN')}**\n\n` +
      `You have spent **₹${total.toLocaleString('en-IN')}** across **${catRes.totalTransactions}** transaction(s) ${timeWin.label}.\n\n` +
      (breakdown.length > 0
        ? `**Top Categories:**\n` +
          breakdown.slice(0, 4).map((b) => `• **${b.category}:** ₹${b.amount.toLocaleString('en-IN')} (${b.percentage}%)`).join('\n') + `\n\n`
        : '') +
      (txsRes.transactions?.length > 0
        ? `**Recent Debits:**\n` +
          txsRes.transactions.slice(0, 3).map((t) => `• **${t.title}**: ₹${Number(t.amount).toLocaleString('en-IN')} (${t.date})`).join('\n')
        : '');

    followUps = [
      'Which expenses can I reduce?',
      'What are my five largest transactions?',
      'Compare this month with last month',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 19: TOTAL INCOME
  // -------------------------------------------------------------
  else if (parsed.intent === 'TOTAL_INCOME') {
    const timeWin = parsed.timeWindow || { label: 'this month' };
    const [summary, incomeTxs] = await Promise.all([
      executeTool('getDashboardSummary', {}, user.id, conversationId),
      executeTool('searchTransactions', { type: 'income', startDate: timeWin.startDate, endDate: timeWin.endDate, limit: 10 }, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getDashboardSummary', args: {}, result: summary },
      { tool: 'searchTransactions', args: { type: 'income' }, result: incomeTxs }
    );

    insights.push({
      type: 'financial_health_card',
      title: `Income Overview (${timeWin.label})`,
      data: summary,
    });

    const totalIncome = summary.totalIncome || 0;
    const txs = incomeTxs.transactions || [];

    if (totalIncome === 0) {
      answer = `### Recorded Income (${timeWin.label}): **₹0**\n\n` +
        `No income transactions have been logged for ${timeWin.label} yet.\n\n` +
        `To track your net savings rate and maintain an accurate ledger:\n` +
        `• Add your salary, freelance earnings, or deposits under **Transactions** (+ Add Transaction → Type: Income).\n` +
        `• Once added, FinTrack AI automatically factors it into your savings capacity and affordability metrics!`;
    } else {
      answer = `### Total Recorded Income (${timeWin.label}): **₹${totalIncome.toLocaleString('en-IN')}**\n\n` +
        `You have logged **₹${totalIncome.toLocaleString('en-IN')}** in earnings across **${txs.length}** deposit(s).\n\n` +
        (txs.length > 0
          ? `**Income Entries:**\n` +
            txs.slice(0, 4).map((t) => `• **${t.title}** (${t.category}): +₹${Number(t.amount).toLocaleString('en-IN')} on ${t.date}`).join('\n') + `\n\n`
          : '') +
        `- **Net Balance:** ₹${summary.totalBalance.toLocaleString('en-IN')}\n` +
        `- **Savings Rate:** ${summary.savingsRate}%`;
    }

    followUps = [
      'Compare my income and expenses over the last three months',
      'Am I spending too much compared to my income?',
      'How much can I save this month?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 20: RECENT TRANSACTIONS LIST
  // -------------------------------------------------------------
  else if (parsed.intent === 'RECENT_TRANSACTIONS') {
    const txsRes = await executeTool('searchTransactions', { limit: parsed.limit || 10, sortBy: 'date' }, user.id, conversationId);
    toolsExecuted.push({ tool: 'searchTransactions', args: { limit: parsed.limit || 10 }, result: txsRes });

    const txs = txsRes.transactions || [];
    insights.push({
      type: 'recent_transactions_card',
      title: 'Recent Ledger Entries',
      data: { count: txs.length, transactions: txs },
    });

    answer = `### Recent Ledger Entries\n\n` +
      `Here are your **${txs.length}** most recent recorded transactions:\n\n` +
      (txs.length > 0
        ? txs.map((t) => `• **${t.title}** (${t.category}): ${t.type === 'income' ? '+' : '-'}₹${Number(t.amount).toLocaleString('en-IN')} on ${t.date}`).join('\n')
        : 'No transactions recorded in your ledger yet.');

    followUps = [
      'What are my five largest transactions?',
      'Where did most of my money go this month?',
      'Which expenses can I reduce?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 21: BUDGET STATUS
  // -------------------------------------------------------------
  else if (parsed.intent === 'BUDGET_STATUS') {
    const budgetsRes = await executeTool('getBudgets', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'getBudgets', args: {}, result: budgetsRes });

    insights.push({
      type: 'budget_progress_card',
      title: 'Budget Allocation & Utilization',
      data: budgetsRes,
    });

    const budgets = budgetsRes.budgets || [];
    const overBudgets = budgets.filter((b) => b.spent > b.allocated);

    answer = `### Category Budgets Overview\n\n` +
      `You have **${budgets.length}** active category budgets totaling **₹${budgetsRes.totalAllocated.toLocaleString('en-IN')}** in limits:\n\n` +
      (budgets.length > 0
        ? budgets.map((b) => {
            const pct = Math.round((b.spent / b.allocated) * 100);
            const status = b.spent > b.allocated ? '⚠️ OVER LIMIT' : `${pct}% used`;
            return `• **${b.category}:** ₹${b.spent.toLocaleString('en-IN')} / ₹${b.allocated.toLocaleString('en-IN')} [${status}]`;
          }).join('\n') + `\n\n`
        : 'No budgets configured yet. You can set one now!\n\n') +
      (overBudgets.length > 0
        ? `⚠️ **Alert:** ${overBudgets.length} budget(s) have exceeded allocated spending limits (${overBudgets.map((b) => b.category).join(', ')}).`
        : `✅ All active category budgets are within their planned spending limits.`);

    followUps = [
      'Create a monthly Food budget of ₹5,000',
      'Which expenses can I reduce?',
      'Where did most of my money go this month?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 22: ANOMALOUS EXPENSES
  // -------------------------------------------------------------
  else if (parsed.intent === 'ANOMALOUS_EXPENSES') {
    const anomRes = await executeTool('detectAnomalousExpenses', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'detectAnomalousExpenses', args: {}, result: anomRes });

    insights.push({
      type: 'financial_health_card',
      title: 'Expense Anomaly Scan',
      data: anomRes,
    });

    const anomalies = anomRes.anomalies || [];
    answer = `### Expense Anomaly Detection\n\n` +
      (anomRes.anomalyCount > 0
        ? `FinTrack AI detected **${anomRes.anomalyCount}** unusual transaction(s) requiring attention:\n\n` +
          anomalies.map((a) => `• **${a.title}** (${a.category}): ₹${Number(a.amount).toLocaleString('en-IN')} on ${a.date} — *${a.reason}*`).join('\n')
        : `🎉 **Zero anomalies detected!** All recent transactions match your typical spending patterns.`);

    followUps = [
      'What are my five largest transactions?',
      'Which expenses can I reduce?',
      'Where did most of my money go this month?',
    ];
  }

  // -------------------------------------------------------------
  // INTENT 23: GENERAL OR AMBIGUOUS FINANCIAL QUERY
  // -------------------------------------------------------------
  else {
    const [summary, budgetsRes, billsRes] = await Promise.all([
      executeTool('getDashboardSummary', {}, user.id, conversationId),
      executeTool('getBudgets', {}, user.id, conversationId),
      executeTool('getBills', { status: 'pending' }, user.id, conversationId),
    ]);

    toolsExecuted.push(
      { tool: 'getDashboardSummary', args: {}, result: summary },
      { tool: 'getBudgets', args: {}, result: budgetsRes },
      { tool: 'getBills', args: {}, result: billsRes }
    );

    insights.push({
      type: 'financial_health_card',
      title: 'Financial Overview',
      data: summary,
    });

    const isDeficit = summary.totalBalance < 0;
    answer = `Hello ${user.name || 'there'}! Here is your live financial snapshot:\n\n` +
      `- **Net Available Balance:** **${isDeficit ? `-₹${Math.abs(summary.totalBalance).toLocaleString('en-IN')}` : `₹${summary.totalBalance.toLocaleString('en-IN')}`}** (${isDeficit ? 'Net Deficit' : 'Surplus'})\n` +
      `- **Total Tracked Income:** ₹${summary.totalIncome.toLocaleString('en-IN')}\n` +
      `- **Total Tracked Expenses:** ₹${summary.totalExpenses.toLocaleString('en-IN')}\n` +
      `- **Net Savings Rate:** **${summary.savingsRate}%**\n` +
      `- **Pending Bills:** ₹${billsRes.pendingTotal.toLocaleString('en-IN')} (${billsRes.totalBills} bills due)\n\n` +
      `Click any option below to view detailed breakdown instantly, or ask your own question:`;

    followUps = [
      'Where did most of my money go this month?',
      'Why is my balance negative?',
      'Can I afford a ₹15,000 purchase?',
      'Why are my expenses increasing?',
      'Compare my income and expenses over the last three months',
      'Which expenses can I reduce?',
    ];
  }

  return {
    content: answer,
    toolCalls: toolsExecuted,
    insights,
    proposals,
    suggestedQuestions: followUps,
  };
};

/**
 * Main AI Chat Processor
 * Calls external LLM (Gemini / OpenAI) if keys are provided,
 * otherwise falls back cleanly to the local financial orchestrator.
 */
export const processAIChat = async ({ user, conversationId, message }) => {
  if (!user || !user.id) {
    throw new Error('User context required');
  }

  // 1. Refresh user memory from recent database changes
  await aiMemory.refreshMemoryFromData(user.id);
  const memoryContext = await aiMemory.getUserContext(user.id);

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  // If Gemini API Key is configured, attempt Gemini with tool definitions
  if (geminiApiKey) {
    console.log('[AI Provider] 🧠 Attempting Google Gemini LLM provider with dynamic tools...');
    try {
      const response = await callGeminiWithTools({
        apiKey: geminiApiKey,
        user,
        conversationId,
        message,
        memoryContext,
      });
      if (response && response.content) {
        console.log('[AI Provider] ✅ Response synthesized successfully via Gemini');
        return response;
      }
    } catch (err) {
      console.warn('[AI Provider] ⚠️ Gemini API call failed, falling back to local orchestrator:', err.message);
    }
  }

  // If OpenAI API Key is configured, attempt OpenAI
  if (openaiApiKey) {
    console.log('[AI Provider] 🧠 Attempting OpenAI LLM provider with function calling...');
    try {
      const response = await callOpenAIWithTools({
        apiKey: openaiApiKey,
        user,
        conversationId,
        message,
        memoryContext,
      });
      if (response && response.content) {
        console.log('[AI Provider] ✅ Response synthesized successfully via OpenAI');
        return response;
      }
    } catch (err) {
      console.warn('[AI Provider] ⚠️ OpenAI API call failed, falling back to local orchestrator:', err.message);
    }
  }

  // Fallback to local Financial Intelligence Orchestrator
  console.log('[AI Provider] ⚡ Executing via Built-in Financial Intelligence Orchestrator');
  return runLocalOrchestrator({ message, user, memoryContext, conversationId });
};

/**
 * Gemini LLM integration with function calling loop
 */
const callGeminiWithTools = async ({ apiKey, user, conversationId, message, memoryContext }) => {
  const systemInstruction = buildSystemPrompt(user, memoryContext.summaryText);
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Map our toolDefinitions to Gemini schema format
  const geminiTools = [
    {
      function_declarations: toolDefinitions.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  // Retrieve past messages for conversation history
  const pastMessages = await aiStore.getMessages(user.id, conversationId);
  const contents = [
    ...pastMessages.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    tools: geminiTools,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API returned ${res.status}: ${errText}`);
  }

  const result = await res.json();
  const candidate = result.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Check for tool call
  const callPart = parts.find((p) => p.functionCall);
  if (callPart) {
    const { name, args } = callPart.functionCall;
    const toolResult = await executeTool(name, args, user.id, conversationId);

    // Feed back function result to Gemini for final answer
    const secondContents = [
      ...contents,
      { role: 'model', parts: [{ functionCall: callPart.functionCall }] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name,
              response: { content: toolResult },
            },
          },
        ],
      },
    ];

    const secondRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, contents: secondContents }),
    });

    if (secondRes.ok) {
      const secondData = await secondRes.json();
      const finalCandidate = secondData.candidates?.[0];
      const finalText = finalCandidate?.content?.parts?.map((p) => p.text).join('\n') || '';

      return {
        content: finalText,
        toolCalls: [{ tool: name, args, result: toolResult }],
        insights: [],
        proposals: [],
        suggestedQuestions: [
          'Can I afford a planned purchase?',
          'Compare this month with last month',
          'Show my upcoming bills',
        ],
      };
    }
  }

  const directText = parts.map((p) => p.text).filter(Boolean).join('\n');
  return {
    content: directText || 'I have analyzed your request.',
    toolCalls: [],
    insights: [],
    proposals: [],
    suggestedQuestions: ['Show my financial overview', 'Check recurring expenses'],
  };
};

/**
 * OpenAI LLM integration with function calling
 */
const callOpenAIWithTools = async ({ apiKey, user, conversationId, message, memoryContext }) => {
  const systemInstruction = buildSystemPrompt(user, memoryContext.summaryText);
  const url = 'https://api.openai.com/v1/chat/completions';

  const pastMessages = await aiStore.getMessages(user.id, conversationId);
  const messages = [
    { role: 'system', content: systemInstruction },
    ...pastMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const tools = toolDefinitions.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      tools,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API returned ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const msg = choice?.message;

  if (msg?.tool_calls && msg.tool_calls.length > 0) {
    const call = msg.tool_calls[0];
    const name = call.function.name;
    const args = JSON.parse(call.function.arguments || '{}');
    const toolResult = await executeTool(name, args, user.id, conversationId);

    // Follow up to synthesize
    const secondRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          ...messages,
          msg,
          {
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(toolResult),
          },
        ],
      }),
    });

    if (secondRes.ok) {
      const secondData = await secondRes.json();
      return {
        content: secondData.choices?.[0]?.message?.content || '',
        toolCalls: [{ tool: name, args, result: toolResult }],
        insights: [],
        proposals: [],
        suggestedQuestions: [
          'Can I afford a planned purchase?',
          'Compare this month with last month',
          'Show my upcoming bills',
        ],
      };
    }
  }

  return {
    content: msg?.content || 'I have processed your query.',
    toolCalls: [],
    insights: [],
    proposals: [],
    suggestedQuestions: ['Show my financial overview', 'Check recurring expenses'],
  };
};

export default { processAIChat };

