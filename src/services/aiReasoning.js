import { executeTool } from './aiTools.js';

/**
 * Natural Language Financial Reasoning & Multi-Turn Context Engine
 * Powers the local orchestrator with deep financial understanding,
 * multi-turn conversation memory, and deterministic tool execution.
 */

// Standard categories in Indian personal finance
export const STANDARD_CATEGORIES = [
  'Food',
  'Dining',
  'Groceries',
  'Housing',
  'Rent',
  'Utilities',
  'Bills',
  'Travel',
  'Transportation',
  'Fuel',
  'Shopping',
  'Entertainment',
  'Healthcare',
  'Medical',
  'Education',
  'Investments',
  'Personal Care',
  'Salary',
  'Freelance',
];

/**
 * Parse monetary amounts and purchase descriptions from natural language
 * Handles: ₹25,000, 25000 rs, rs 25,000, 25k, 2.5 lakh, 25000 inr, ₹12000
 */
export const extractAmountAndItem = (text) => {
  const clean = text.toLowerCase();

  // Pattern: "k" multiplier (e.g. 25k, 10.5k)
  const kMatch = clean.match(/(?:₹|rs\.?|inr)?\s*([0-9]+(?:\.[0-9]+)?)\s*k\b/i);
  if (kMatch) {
    const amt = parseFloat(kMatch[1]) * 1000;
    const item = extractItemDescription(clean, kMatch[0]);
    return { amount: amt, item };
  }

  // Pattern: "lakh / lac" multiplier (e.g. 1.5 lakh)
  const lakhMatch = clean.match(/(?:₹|rs\.?|inr)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lac)s?\b/i);
  if (lakhMatch) {
    const amt = parseFloat(lakhMatch[1]) * 100000;
    const item = extractItemDescription(clean, lakhMatch[0]);
    return { amount: amt, item };
  }

  // Standard numeric pattern (e.g. ₹25,000, 25000 rs, rs. 25000)
  const numMatch = clean.match(/(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})(?:\.[0-9]{1,2})?(?:\s*(?:rs\.?|rupees|inr))?/i);
  if (numMatch) {
    const rawNum = numMatch[1].replace(/,/g, '');
    const amt = parseFloat(rawNum);
    if (!isNaN(amt) && amt > 0) {
      const item = extractItemDescription(clean, numMatch[0]);
      return { amount: amt, item };
    }
  }

  return { amount: 0, item: 'Planned Purchase' };
};

const extractItemDescription = (text, matchedAmountStr) => {
  let cleaned = text
    .replace(matchedAmountStr, '')
    .replace(/\b(can i afford|can i buy|should i buy|purchase of|a new|worth|for|an?)\b/gi, '')
    .replace(/[?!.,]/g, '')
    .trim();

  if (cleaned.length > 2) {
    // Capitalize words
    return cleaned
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return 'Planned Purchase';
};

/**
 * Parse human temporal expressions (this month, last month, last week, last 3 months, etc.)
 */
export const parseTimeWindow = (text) => {
  const clean = text.toLowerCase();
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0-indexed

  if (clean.includes('last week') || clean.includes('past week') || clean.includes('past 7 days')) {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return {
      type: 'last_week',
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      label: 'over the past 7 days',
    };
  }

  if (clean.includes('this week') || clean.includes('current week')) {
    const start = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    start.setDate(diff);
    return {
      type: 'this_week',
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      label: 'this week',
    };
  }

  if (clean.includes('last 3 months') || clean.includes('past 3 months') || clean.includes('past three months') || clean.includes('last quarter')) {
    const start = new Date(curYear, curMonth - 3, 1);
    return {
      type: 'last_3_months',
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      monthsCount: 3,
      label: 'over the last 3 months',
    };
  }

  if (clean.includes('last 6 months') || clean.includes('past 6 months') || clean.includes('past six months')) {
    const start = new Date(curYear, curMonth - 6, 1);
    return {
      type: 'last_6_months',
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      monthsCount: 6,
      label: 'over the last 6 months',
    };
  }

  if (clean.includes('last month') || clean.includes('previous month')) {
    const firstDay = new Date(curYear, curMonth - 1, 1);
    const lastDay = new Date(curYear, curMonth, 0);
    return {
      type: 'last_month',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      month: firstDay.getMonth(),
      year: firstDay.getFullYear(),
      label: firstDay.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    };
  }

  if (clean.includes('this month') || clean.includes('current month')) {
    const firstDay = new Date(curYear, curMonth, 1);
    const lastDay = new Date(curYear, curMonth + 1, 0);
    return {
      type: 'this_month',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      month: curMonth,
      year: curYear,
      label: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    };
  }

  if (clean.includes('this year') || clean.includes('current year')) {
    const firstDay = new Date(curYear, 0, 1);
    return {
      type: 'this_year',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      year: curYear,
      label: `Year ${curYear}`,
    };
  }

  if (clean.includes('last year') || clean.includes('previous year')) {
    const firstDay = new Date(curYear - 1, 0, 1);
    const lastDay = new Date(curYear - 1, 11, 31);
    return {
      type: 'last_year',
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      year: curYear - 1,
      label: `Year ${curYear - 1}`,
    };
  }

  // Specific month check: e.g. "in january", "in march"
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  for (let mIdx = 0; mIdx < monthNames.length; mIdx++) {
    const mName = monthNames[mIdx];
    if (new RegExp(`\\b${mName}\\b`, 'i').test(clean)) {
      const year = clean.match(/\b(202[0-9])\b/)?.[1] ? parseInt(clean.match(/\b(202[0-9])\b/)[1], 10) : curYear;
      const firstDay = new Date(year, mIdx, 1);
      const lastDay = new Date(year, mIdx + 1, 0);
      return {
        type: 'specific_month',
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0],
        month: mIdx,
        year,
        label: `${mName.charAt(0).toUpperCase() + mName.slice(1)} ${year}`,
      };
    }
  }

  // Default: current month if question implies current timeframe, else null
  const lastDayOfCurMonth = new Date(curYear, curMonth + 1, 0);
  return {
    type: 'this_month',
    startDate: new Date(curYear, curMonth, 1).toISOString().split('T')[0],
    endDate: lastDayOfCurMonth.toISOString().split('T')[0],
    month: curMonth,
    year: curYear,
    label: 'this month',
    isDefault: true,
  };
};

/**
 * Match category name from natural language query
 */
export const extractCategory = (text) => {
  const clean = text.toLowerCase();

  const mapping = [
    { cat: 'Food', keywords: ['food', 'dining', 'restaurant', 'zomato', 'swiggy', 'lunch', 'dinner', 'breakfast', 'cafe', 'coffee'] },
    { cat: 'Groceries', keywords: ['groceries', 'grocery', 'supermarket', 'blinkit', 'zepto', 'instamart', 'vegetables', 'fruits'] },
    { cat: 'Housing', keywords: ['housing', 'rent', 'lease', 'apartment', 'flat', 'maintenance'] },
    { cat: 'Utilities', keywords: ['utility', 'utilities', 'electricity', 'power', 'water', 'gas', 'internet', 'wifi', 'broadband', 'airtel', 'jio', 'recharge', 'mobile'] },
    { cat: 'Bills', keywords: ['bill', 'bills', 'dues', 'invoice'] },
    { cat: 'Travel', keywords: ['travel', 'transport', 'fuel', 'petrol', 'diesel', 'uber', 'ola', 'cab', 'flight', 'train', 'metro', 'commute'] },
    { cat: 'Shopping', keywords: ['shopping', 'clothes', 'clothing', 'amazon', 'flipkart', 'myntra', 'electronics', 'gadgets'] },
    { cat: 'Entertainment', keywords: ['entertainment', 'movie', 'movies', 'cinema', 'netflix', 'spotify', 'prime', 'hotstar', 'gaming', 'concert'] },
    { cat: 'Healthcare', keywords: ['healthcare', 'medical', 'medicine', 'pharmacy', 'hospital', 'doctor', 'clinic', 'dentist'] },
    { cat: 'Education', keywords: ['education', 'course', 'tuition', 'books', 'udemy', 'college', 'school'] },
    { cat: 'Investments', keywords: ['investment', 'investments', 'stocks', 'mutual fund', 'sip', 'gold', 'crypto'] },
    { cat: 'Salary', keywords: ['salary', 'income', 'paycheck', 'earnings', 'freelance'] },
  ];

  for (const m of mapping) {
    for (const kw of m.keywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(clean)) {
        return m.cat;
      }
    }
  }

  return null;
};

/**
 * Resolve context from past conversation messages
 * Remembers:
 * - lastCategory (e.g. 'Food')
 * - lastTimeWindow (e.g. 'this month', 'last month')
 * - lastIntent (e.g. 'CATEGORY_SPENDING', 'MONTHLY_COMPARISON', 'AFFORDABILITY')
 * - lastAmount (e.g. 4500)
 * - lastTool (e.g. 'getSpendingByCategory')
 */
export const resolveConversationContext = (pastMessages = []) => {
  const context = {
    lastCategory: null,
    lastTimeWindow: null,
    lastIntent: null,
    lastAmount: null,
    lastTool: null,
    lastAssistantTurn: null,
    recentUserQueries: [],
  };

  if (!pastMessages || pastMessages.length === 0) {
    return context;
  }

  // Iterate backwards from most recent message
  for (let i = pastMessages.length - 1; i >= 0; i--) {
    const msg = pastMessages[i];

    if (msg.role === 'user') {
      context.recentUserQueries.push(msg.content);
      if (!context.lastCategory) {
        context.lastCategory = extractCategory(msg.content);
      }
    } else if (msg.role === 'assistant') {
      if (!context.lastAssistantTurn) {
        context.lastAssistantTurn = msg.content;
      }
      // Inspect tool calls in assistant turn
      const tools = msg.tool_calls || [];
      if (tools.length > 0 && !context.lastTool) {
        context.lastTool = tools[0].tool;
      }

      // Check insights for stored category
      const insights = msg.insights || [];
      for (const ins of insights) {
        if (ins.data?.breakdown && !context.lastCategory) {
          context.lastCategory = ins.data.breakdown[0]?.category || null;
        }
      }
    }

    // Stop after looking back 4 turns
    if (context.recentUserQueries.length >= 4 && context.lastCategory) break;
  }

  return context;
};

/**
 * Semantic intent classifier that combines user text + active conversation context
 */
export const classifyFinancialIntent = (messageText, context = {}) => {
  const text = messageText.toLowerCase().trim();

  // 1. Check for conversational follow-ups first
  // e.g. "What about last month?", "And last month?", "How about last month?"
  const isTimeShiftFollowUp =
    /^(what about|how about|and|what was it in|show|check)\s+(last month|previous month|last week|this month|last year)\b/i.test(text) ||
    /^(what about|and)\s+(food|groceries|travel|shopping|housing|utilities|entertainment)\b/i.test(text) ||
    text === 'what about last month?' ||
    text === 'what about last month' ||
    text === 'and last month?' ||
    text === 'and last month';

  if (isTimeShiftFollowUp) {
    const explicitCat = extractCategory(text);
    const targetCategory = explicitCat || context.lastCategory || 'Food';
    const timeWin = parseTimeWindow(text);
    return {
      intent: 'CATEGORY_SPENDING',
      category: targetCategory,
      timeWindow: timeWin,
      isFollowUp: true,
      contextSource: explicitCat ? 'explicit' : 'history_inherited',
    };
  }

  // e.g. "Why did it increase?", "Why did it go up?", "Why is it higher?", "What caused the increase?"
  if (
    /why did (it|expenses|spending|this) (increase|go up|rise|jump)/i.test(text) ||
    /why (are|is) (my )?(expenses|spending) (increasing|higher|going up|rising)/i.test(text) ||
    /what caused (the|this|my) (increase|rise|spike|jump)/i.test(text) ||
    text === 'why did it increase?' ||
    text === 'why did it increase' ||
    text === 'why did it go up?'
  ) {
    return {
      intent: 'WHY_EXPENSES_INCREASED',
      category: extractCategory(text) || context.lastCategory || null,
      isFollowUp: true,
    };
  }

  // 2. "Why is my balance negative?" / Deficit explanation
  if (
    /why (is|do i have|my) (my )?(balance|account|ledger|status) (negative|in deficit|minus|below zero)/i.test(text) ||
    /why is it (negative|minus|below zero)/i.test(text) ||
    /why (is )?negative balance/i.test(text) ||
    /negative balance/i.test(text) ||
    /in deficit/i.test(text) ||
    text.includes('balance is negative') ||
    text.includes('balance negative')
  ) {
    return {
      intent: 'NEGATIVE_BALANCE',
    };
  }

  // 3. "Can I afford a new phone worth ₹25,000?" / Purchase Affordability
  if (
    text.includes('afford') ||
    text.includes('can i buy') ||
    text.includes('should i buy') ||
    text.includes('can i purchase') ||
    text.includes('purchase of')
  ) {
    const { amount, item } = extractAmountAndItem(text);
    return {
      intent: 'AFFORDABILITY',
      amount,
      item,
    };
  }

  // 4. "Where did most of my money go this month?" / "Where is my money going?"
  if (
    /where (did|is) (most of )?(my )?money (go|going)/i.test(text) ||
    /where did i spend (the )?most/i.test(text) ||
    /what did i spend (my )?money on/i.test(text) ||
    /what (were|are) my biggest spending categories/i.test(text) ||
    /highest spending category/i.test(text) ||
    /spending breakdown/i.test(text) ||
    /expense breakdown/i.test(text)
  ) {
    return {
      intent: 'WHERE_DID_MONEY_GO',
      timeWindow: parseTimeWindow(text),
    };
  }

  // 5. "What are my five largest transactions?" / "biggest expenses"
  if (
    /(what are|show|get|list|display) (my )?([a-z0-9]+)?\s*(largest|biggest|highest|top|most expensive)\s*(transactions?|expenses?|purchases?|debits?)/i.test(text) ||
    /top\s*([0-9]+)?\s*(expenses?|transactions?|purchases?)/i.test(text) ||
    /biggest expenses?/i.test(text) ||
    /largest transactions?/i.test(text) ||
    /highest purchases?/i.test(text)
  ) {
    let limit = 5;
    const numWordMatch = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)\b/i);
    if (numWordMatch) {
      const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      const val = wordMap[numWordMatch[1].toLowerCase()] || parseInt(numWordMatch[1], 10);
      if (!isNaN(val) && val > 0 && val <= 50) limit = val;
    }
    return {
      intent: 'TOP_TRANSACTIONS',
      limit,
      type: text.includes('income') ? 'income' : 'expense',
    };
  }

  // 6. Recent transactions query (e.g. "my transactions", "recent transactions", "transactions")
  if (
    /^(what are my|show my|list|get|recent|my|past|view|all)?\s*(transactions?|history|purchases?|activity|ledger|statement)\b/i.test(text) ||
    text === 'transactions' ||
    text === 'my transactions' ||
    text === 'recent transactions' ||
    text === 'show transactions' ||
    text === 'transactions list' ||
    text === 'recent activity' ||
    text === 'ledger' ||
    text === 'statement'
  ) {
    return {
      intent: 'RECENT_TRANSACTIONS',
      limit: 10,
    };
  }

  // 7. "Compare my income and expenses over the last three months" / multi-month
  if (
    /compare (my )?(income and expenses?|spending|cash flow) over the last (three|3|six|6) months/i.test(text) ||
    /last (three|3|six|6) months (trend|comparison|breakdown|history)/i.test(text) ||
    /spending (trend|over time) over the last (three|3) months/i.test(text) ||
    /quarterly (comparison|analysis|trend)/i.test(text)
  ) {
    const monthsCount = text.includes('six') || text.includes('6') ? 6 : 3;
    return {
      intent: 'MULTI_MONTH_TREND',
      monthsCount,
    };
  }

  // 8. "Compare this month with last month" / monthly comparison
  if (
    /compare this month with last month/i.test(text) ||
    /this month vs last month/i.test(text) ||
    /compare (spending|expenses?) (with|to|against) last month/i.test(text) ||
    (text.includes('compare') && (text.includes('last month') || text.includes('month over month')))
  ) {
    return {
      intent: 'MONTHLY_COMPARISON',
    };
  }

  // 9. "Am I spending too much compared to my income?" / "Am I overspending?"
  if (
    /am i spending too much/i.test(text) ||
    /am i overspending/i.test(text) ||
    /spending (too much|excessive|high) (compared to|relative to|of) (my )?income/i.test(text) ||
    /income vs expenses?/i.test(text) ||
    /spending (ratio|percentage) of (my )?income/i.test(text) ||
    /how is my cashflow/i.test(text)
  ) {
    return {
      intent: 'INCOME_VS_EXPENSES',
      timeWindow: parseTimeWindow(text),
    };
  }

  // 10. "How much can I save this month?" / "What is my savings potential?"
  if (
    /how much (can|will|could) i save/i.test(text) ||
    /savings? potential/i.test(text) ||
    /projected savings?/i.test(text) ||
    /expected savings/i.test(text) ||
    /how much surplus will i have/i.test(text) ||
    text === 'savings' ||
    text === 'my savings'
  ) {
    return {
      intent: 'SAVINGS_CAPACITY',
      timeWindow: parseTimeWindow(text),
    };
  }

  // 11. "Which expenses can I reduce?" / "Where can I cut expenses?"
  if (
    /which expenses? can i reduce/i.test(text) ||
    /where can i (cut|trim|reduce) (expenses?|costs?|spending)/i.test(text) ||
    /how (can i|to) save (more )?money/i.test(text) ||
    /savings? opportunit(y|ies)/i.test(text) ||
    /ways to save money/i.test(text) ||
    /cut down (my )?spending/i.test(text)
  ) {
    return {
      intent: 'REDUCE_EXPENSES',
    };
  }

  // 12. Propose Action (Create budget, set budget, update limit)
  if (
    text.includes('budget') &&
    (text.includes('create') || text.includes('set') || text.includes('make') || text.includes('update') || text.includes('limit') || text.includes('add'))
  ) {
    const { amount } = extractAmountAndItem(text);
    return {
      intent: 'PROPOSE_ACTION',
      amount: amount || 5000,
      category: extractCategory(text) || 'Food',
    };
  }

  // 13. Budget Status (e.g. "my budgets", "show budgets", "budgets")
  if (
    /^(what are my|show my|my|check|current|all)?\s*budgets?\b/i.test(text) ||
    /budget (status|progress|limits?|overview|summary)/i.test(text) ||
    /how (are|is) my budgets?/i.test(text) ||
    text === 'budget' ||
    text === 'budgets' ||
    text === 'my budgets' ||
    text === 'show budgets'
  ) {
    return {
      intent: 'BUDGET_STATUS',
    };
  }

  // 14. Bills & Utilities (e.g. "bills", "my bills", "upcoming bills")
  if (
    text.includes('bill') ||
    text.includes('utility') ||
    text.includes('due') ||
    text.includes('recharge') ||
    text.includes('electricity') ||
    text.includes('pending payment') ||
    text === 'bills' ||
    text === 'my bills'
  ) {
    return {
      intent: 'BILLS_AND_UTILITIES',
    };
  }

  // 15. Subscriptions & Recurring
  if (
    text.includes('recurring') ||
    text.includes('subscription') ||
    text.includes('repeat') ||
    text.includes('membership') ||
    text === 'subscriptions'
  ) {
    return {
      intent: 'RECURRING_SUBSCRIPTIONS',
    };
  }

  // 16. Bank Balances (e.g. "bank balance", "in my bank")
  if (
    text.includes('bank account') ||
    text.includes('bank balance') ||
    text.includes('recorded balance') ||
    text.includes('in my bank')
  ) {
    return {
      intent: 'BANK_BALANCES',
    };
  }

  // 17. Net Balance (e.g. "what is my balance", "my balance", "balance", "how much money do i have")
  if (
    /^(what is my|show my|check|get|my|current|available|net|total|account)?\s*balances?\b/i.test(text) ||
    /how much (money|cash|balance) (do i have|is left|is available)/i.test(text) ||
    /what('s| is) (my )?(net|current|available)?\s*balance/i.test(text) ||
    text === 'balance' ||
    text === 'my balance' ||
    text === 'net balance' ||
    text === 'account balance' ||
    text === 'current balance'
  ) {
    return {
      intent: 'NET_BALANCE',
    };
  }

  // 18. Total Expenses (e.g. "my expenses", "what are my expenses", "expenses", "spending", "total expenses")
  if (
    /^(what are my|show my|total|my|current)?\s*expenses?\b/i.test(text) ||
    /how much (did i spend|have i spent|is my spending)/i.test(text) ||
    /total (spending|expenses?|debits?|outflow)/i.test(text) ||
    text === 'expenses' ||
    text === 'my expenses' ||
    text === 'spending' ||
    text === 'total expenses' ||
    text === 'what did i spend'
  ) {
    return {
      intent: 'TOTAL_EXPENSES',
      timeWindow: parseTimeWindow(text),
    };
  }

  // 19. Total Income (e.g. "my income", "what is my income", "income", "salary", "earnings")
  if (
    /^(what is my|show my|total|my|current)?\s*(income|salary|earnings?|paycheck)\b/i.test(text) ||
    /how much (did i earn|have i earned|is my income|was deposited)/i.test(text) ||
    /total (income|earnings?|inflow)/i.test(text) ||
    text === 'income' ||
    text === 'my income' ||
    text === 'salary' ||
    text === 'total income'
  ) {
    return {
      intent: 'TOTAL_INCOME',
      timeWindow: parseTimeWindow(text),
    };
  }

  // 20. Anomalies / Unusual Spending
  if (
    text.includes('anomaly') ||
    text.includes('anomalies') ||
    text.includes('unusual') ||
    text.includes('suspicious') ||
    text.includes('unexpected') ||
    text.includes('spike')
  ) {
    return {
      intent: 'ANOMALOUS_EXPENSES',
    };
  }

  // 21. "Explain my current financial situation" / Holistic Health Diagnostic
  if (
    /explain my (current )?financial (situation|status|health|standing)/i.test(text) ||
    /how is my (overall )?financial (health|situation|standing|status)/i.test(text) ||
    /financial (overview|summary|diagnostic|health check)/i.test(text) ||
    /summary of my finances/i.test(text) ||
    /evaluate my (finances|financial health)/i.test(text) ||
    text === 'explain my financial situation' ||
    text === 'explain my current financial situation' ||
    text === 'overview' ||
    text === 'summary' ||
    text === 'financial overview'
  ) {
    return {
      intent: 'EXPLAIN_FINANCIAL_SITUATION',
    };
  }

  // 22. Category Spending Query (e.g. "Food", "How much on food", "travel spending")
  const catMatch = extractCategory(text);
  if (
    (catMatch && (text.includes('spend') || text.includes('spent') || text.includes('how much') || text.includes('on') || text.includes('in') || text.includes('cost') || text.includes('for'))) ||
    text.includes('spend on') ||
    text.includes('spent on') ||
    text.includes('how much for') ||
    text.includes('how much did i spend') ||
    (catMatch && !text.includes('bill') && !text.includes('account'))
  ) {
    return {
      intent: 'CATEGORY_SPENDING',
      category: catMatch || context.lastCategory || 'Food',
      timeWindow: parseTimeWindow(text),
    };
  }

  // 23. General or ambiguous financial question
  return {
    intent: 'GENERAL_FINANCIAL_QUERY',
    timeWindow: parseTimeWindow(text),
  };
};

/**
 * Multi-month trend generator (Month-by-month Income, Expenses, Savings Rate, Top Category)
 */
export const computeMultiMonthSummary = async (userId, conversationId, monthsCount = 3) => {
  const transactionsRes = await executeTool('searchTransactions', { limit: 200 }, userId, conversationId);
  const txs = transactionsRes.transactions || [];

  const now = new Date();
  const monthsData = [];

  for (let i = 0; i < monthsCount; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yr = targetDate.getFullYear();
    const mo = targetDate.getMonth();
    const monthLabel = targetDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    let income = 0;
    let expense = 0;
    const catMap = {};

    txs.forEach((t) => {
      if (!t.date) return;
      const d = new Date(t.date);
      if (d.getFullYear() === yr && d.getMonth() === mo) {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') income += amt;
        if (t.type === 'expense') {
          expense += amt;
          const cat = t.category || 'General';
          catMap[cat] = (catMap[cat] || 0) + amt;
        }
      }
    });

    // Top category
    const topCatEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    const netSavings = income - expense;
    const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;

    monthsData.push({
      monthLabel,
      year: yr,
      month: mo,
      income: Math.round(income),
      expense: Math.round(expense),
      netSavings: Math.round(netSavings),
      savingsRate,
      topCategory: topCatEntry ? { name: topCatEntry[0], amount: Math.round(topCatEntry[1]) } : null,
    });
  }

  return monthsData.reverse(); // chronological order
};

/**
 * Causal analysis for why expenses increased (overall or in a specific category)
 */
export const explainExpenseIncrease = async (userId, conversationId, targetCategory = null) => {
  const comp = await executeTool('compareMonthlySpending', {}, userId, conversationId);
  const anomalies = await executeTool('detectAnomalousExpenses', {}, userId, conversationId);
  const txsRes = await executeTool('searchTransactions', { limit: 50, sortBy: 'amount' }, userId, conversationId);

  const now = new Date();
  const curMo = now.getMonth();
  const curYr = now.getFullYear();
  const prevDate = new Date(curYr, curMo - 1, 1);
  const prevMo = prevDate.getMonth();
  const prevYr = prevDate.getFullYear();

  const currentTxs = (txsRes.transactions || []).filter((t) => {
    if (!t.date) return false;
    const d = new Date(t.date);
    return d.getMonth() === curMo && d.getFullYear() === curYr && t.type === 'expense';
  });

  const previousTxs = (txsRes.transactions || []).filter((t) => {
    if (!t.date) return false;
    const d = new Date(t.date);
    return d.getMonth() === prevMo && d.getFullYear() === prevYr && t.type === 'expense';
  });

  if (targetCategory) {
    const curCatTxs = currentTxs.filter((t) => (t.category || '').toLowerCase() === targetCategory.toLowerCase());
    const prevCatTxs = previousTxs.filter((t) => (t.category || '').toLowerCase() === targetCategory.toLowerCase());

    const curTotal = curCatTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const prevTotal = prevCatTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const delta = curTotal - prevTotal;
    const pct = prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : 100;

    return {
      type: 'category',
      category: targetCategory,
      currentTotal: curTotal,
      previousTotal: prevTotal,
      difference: delta,
      percentageChange: pct,
      topTransactions: curCatTxs.slice(0, 3),
      comparison: comp,
    };
  }

  // Overall monthly increase drivers
  const spikingCategories = (comp.categoryDeltas || [])
    .filter((c) => c.difference > 0)
    .slice(0, 3);

  return {
    type: 'overall',
    difference: comp.difference,
    percentageChange: comp.percentageChange,
    spikingCategories,
    topAnomalies: (anomalies.anomalies || []).slice(0, 2),
    largestRecentExpenses: currentTxs.slice(0, 3),
    comparison: comp,
  };
};

