import { toolDefinitions, executeTool } from './aiTools.js';
import { aiMemory } from './aiMemory.js';
import { aiStore } from './aiStore.js';

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
const runLocalOrchestrator = async ({ message, user, memoryContext, conversationId }) => {
  const text = message.toLowerCase().trim();
  const toolsExecuted = [];
  const insights = [];
  const proposals = [];
  let answer = '';
  let followUps = [];

  // 1. AFFORDABILITY INTENT: "can I afford...", "can I buy...", "afford a ₹..."
  if (
    text.includes('afford') ||
    text.includes('can i buy') ||
    text.includes('should i buy') ||
    text.includes('purchase of')
  ) {
    // Extract amount
    const amtMatch = text.match(/(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    let amount = 0;
    if (amtMatch && amtMatch[1]) {
      amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    }

    if (amount > 0) {
      const toolRes = await executeTool(
        'analyzeAffordability',
        { amount, itemDescription: message },
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

      answer = `### Affordability Analysis for ₹${amount.toLocaleString('en-IN')}\n\n${toolRes.reason}\n\n` +
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
      answer = `To evaluate affordability accurately, please specify the approximate cost of the item in Indian Rupees (₹). For example: *"Can I afford a ₹15,000 laptop?"*`;
      followUps = ['Can I afford a ₹10,000 purchase?', 'What is my current net balance?'];
    }
  }

  // 2. COMPARE MONTHS INTENT
  else if (
    text.includes('compare') ||
    (text.includes('last month') && (text.includes('this month') || text.includes('vs') || text.includes('difference')))
  ) {
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

  // 3. PROPOSE ACTION INTENT: "create budget", "set budget of ₹..."
  else if (
    (text.includes('budget') && (text.includes('create') || text.includes('set') || text.includes('make')))
  ) {
    const amtMatch = text.match(/(?:₹|rs\.?|inr)?\s*([0-9,]+)/i);
    const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 5000;

    // Detect category
    const categories = ['Food', 'Groceries', 'Entertainment', 'Shopping', 'Travel', 'Bills', 'Utilities', 'Housing'];
    let matchedCat = 'Food';
    for (const c of categories) {
      if (text.includes(c.toLowerCase())) {
        matchedCat = c;
        break;
      }
    }

    const prop = await executeTool(
      'proposeAction',
      {
        actionType: 'create_budget',
        details: { category: matchedCat, allocated: amount, name: `${matchedCat} Budget` },
        summary: `Set monthly ${matchedCat} budget limit to ₹${amount.toLocaleString('en-IN')}`,
      },
      user.id,
      conversationId
    );
    toolsExecuted.push({ tool: 'proposeAction', args: { actionType: 'create_budget' }, result: prop });
    proposals.push(prop);

    answer = `I have prepared a proposed budget update for you:\n\n` +
      `🎯 **Action:** Set monthly **${matchedCat}** budget limit to **₹${amount.toLocaleString('en-IN')}**.\n\n` +
      `To ensure security and user control, please review and click **Confirm & Apply** below to update your live budget table.`;

    followUps = ['Show current budgets', 'Show food spending this month'];
  }

  // 4. BILLS & UTILITIES INTENT
  else if (text.includes('bill') || text.includes('utility') || text.includes('due') || text.includes('recharge')) {
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

  // 5. RECURRING SUBSCRIPTIONS & COMMITED EXPENSES
  else if (text.includes('recurring') || text.includes('subscription') || text.includes('repeat')) {
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
      'Where can I save money?',
      'Show my bills',
      'What is my monthly burn rate?',
    ];
  }

  // 6. BIGGEST / TOP EXPENSES: "what were my biggest expenses", "largest expenses", "top expenses"
  else if (
    text.includes('biggest') ||
    text.includes('largest') ||
    text.includes('highest') ||
    text.includes('top expense') ||
    text.includes('most expensive')
  ) {
    const searchRes = await executeTool(
      'searchTransactions',
      { type: 'expense', sortBy: 'amount', limit: 5 },
      user.id,
      conversationId
    );
    toolsExecuted.push({ tool: 'searchTransactions', args: { type: 'expense', sortBy: 'amount', limit: 5 }, result: searchRes });

    insights.push({
      type: 'recent_transactions_card',
      title: 'Top Recorded Expenses',
      data: searchRes,
    });

    const txs = searchRes.transactions || [];
    answer = `### Top Recorded Expenses\n\n` +
      `Here are your largest recorded expenses:\n\n` +
      (txs.length > 0
        ? txs
            .map((t, idx) => `${idx + 1}. **${t.title}** (${t.category}): **₹${Number(t.amount).toLocaleString('en-IN')}** on ${t.date}`)
            .join('\n')
        : 'No expense transactions recorded yet.');

    followUps = [
      'Show my category breakdown',
      'Where can I save money?',
      'Compare this month with last month',
    ];
  }

  // 7. SPENDING BY CATEGORY: "how much did I spend on...", "breakdown", "food"
  else if (
    text.includes('category') ||
    text.includes('breakdown') ||
    text.includes('spend on') ||
    text.includes('spent on') ||
    text.includes('food') ||
    text.includes('groceries') ||
    text.includes('travel') ||
    text.includes('shopping')
  ) {
    const isThisMonth = text.includes('this month') || text.includes('current month');
    const now = new Date();
    const catArgs = isThisMonth ? { month: now.getMonth(), year: now.getFullYear() } : {};
    const catRes = await executeTool('getSpendingByCategory', catArgs, user.id, conversationId);
    toolsExecuted.push({ tool: 'getSpendingByCategory', args: catArgs, result: catRes });

    insights.push({
      type: 'category_breakdown_card',
      title: 'Expense Breakdown by Category',
      data: catRes,
    });

    // Check if user named a specific category
    const specificCategories = ['food', 'groceries', 'entertainment', 'travel', 'shopping', 'utilities', 'bills'];
    const matched = specificCategories.find((c) => text.includes(c));

    if (matched) {
      const matchItem = (catRes.breakdown || []).find((b) => b.category.toLowerCase().includes(matched));
      if (matchItem) {
        answer = `### Spending in ${matchItem.category}\n\n` +
          `You have spent **₹${matchItem.amount.toLocaleString('en-IN')}** on **${matchItem.category}**, which accounts for **${matchItem.percentage}%** of your total tracked expenses (₹${catRes.totalExpense.toLocaleString('en-IN')}).`;
      } else {
        answer = `No transactions found under "${matched}" in your recorded history. Total tracked expenses across all categories are **₹${catRes.totalExpense.toLocaleString('en-IN')}**.`;
      }
    } else {
      answer = `### Category Expense Breakdown\n\n` +
        `Total tracked expenses are **₹${catRes.totalExpense.toLocaleString('en-IN')}** across ${catRes.categoriesCount} categories:\n\n` +
        (catRes.breakdown || [])
          .slice(0, 5)
          .map((b) => `• **${b.category}:** ₹${b.amount.toLocaleString('en-IN')} (${b.percentage}%)`)
          .join('\n');
    }

    followUps = [
      'Compare this month with last month',
      'Can I afford a ₹5,000 purchase?',
      'Show my budgets',
    ];
  }

  // 7. SAVINGS OPPORTUNITIES & OPTIMIZATION
  else if (text.includes('save') || text.includes('cut') || text.includes('opportunity') || text.includes('reduce')) {
    const opps = await executeTool('identifySavingsOpportunities', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'identifySavingsOpportunities', args: {}, result: opps });

    insights.push({
      type: 'savings_opportunities_card',
      title: 'Personalized Savings Strategies',
      data: opps,
    });

    answer = `### Actionable Savings Opportunities\n\n` +
      (opps.length > 0
        ? opps.map((o) => `💡 **${o.category}**: ${o.recommendation}`).join('\n\n')
        : 'Your spending is currently well-balanced with no critical overruns detected! Continue monitoring your budgets to build long-term savings.');

    followUps = [
      'Estimate my month-end savings',
      'Show my recurring subscriptions',
      'What are my current budgets?',
    ];
  }

  // 8. MONTH-END PROJECTION & RUN RATE
  else if (text.includes('month end') || text.includes('burn rate') || text.includes('forecast') || text.includes('projection')) {
    const proj = await executeTool('estimateMonthEndSpending', {}, user.id, conversationId);
    toolsExecuted.push({ tool: 'estimateMonthEndSpending', args: {}, result: proj });

    insights.push({
      type: 'projection_card',
      title: `${proj.curMonthName} Spending Projection`,
      data: proj,
    });

    answer = `### Month-End Cash Flow Forecast\n\n` +
      `- **Days Elapsed:** ${proj.currentDay} of ${proj.totalDaysInMonth} (${proj.remainingDays} days remaining)\n` +
      `- **Current Month Spending So Far:** ₹${proj.actualExpenseSoFar.toLocaleString('en-IN')}\n` +
      `- **Daily Average Burn Rate:** ₹${proj.dailyBurnRate.toLocaleString('en-IN')}/day\n` +
      `- **Projected Month-End Total Expense:** **₹${proj.projectedTotalExpense.toLocaleString('en-IN')}**\n` +
      `- **Forecasted Remaining Net Balance:** **₹${proj.projectedRemainingBalance.toLocaleString('en-IN')}**\n\n` +
      (proj.burnRateWarning
        ? `⚠️ **Burn Rate Alert:** At this pace, your projected expenses will exceed your income for this month.`
        : `✅ **Healthy Trajectory:** Your current pace leaves a positive estimated surplus.`);

    followUps = [
      'How can I reduce daily burn rate?',
      'Check upcoming bills',
      'Can I afford a ₹10,000 expense?',
    ];
  }

  // 9. DEFAULT: COMPREHENSIVE FINANCIAL SUMMARY & STATUS
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
      title: 'Current Financial Snapshot',
      data: summary,
    });

    answer = `Hello ${user.name || 'there'}! Here is your current financial snapshot:\n\n` +
      `- **Net Cash Flow Balance:** **₹${summary.totalBalance.toLocaleString('en-IN')}**\n` +
      `- **Total Recorded Income:** ₹${summary.totalIncome.toLocaleString('en-IN')}\n` +
      `- **Total Expenses:** ₹${summary.totalExpenses.toLocaleString('en-IN')}\n` +
      `- **Current Savings Rate:** **${summary.savingsRate}%**\n` +
      `- **Pending Bills:** ₹${billsRes.pendingTotal.toLocaleString('en-IN')} (${billsRes.totalBills} bills due)\n\n` +
      `How can I assist your financial planning today? You can ask me to evaluate a purchase, compare monthly expenses, or explore savings opportunities.`;

    followUps = [
      'Compare this month with last month',
      'Can I afford a ₹10,000 purchase?',
      'Detect my recurring subscriptions',
      'Show my category spending breakdown',
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

