import { classifyFinancialIntent } from './src/services/aiReasoning.js';
import { runLocalOrchestrator } from './src/services/aiProvider.js';

console.log('======================================================');
console.log('🧪 TESTING MANUAL INPUT INTENTS & ASSISTANT REPLIES');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

const assert = (condition, testName, details = '') => {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${details}`);
    failed++;
  }
};

// 1. Test Intent Classification for typical user manual inputs
const testCases = [
  { text: 'Why is my balance negative?', expected: 'NEGATIVE_BALANCE' },
  { text: 'why is balance negative', expected: 'NEGATIVE_BALANCE' },
  { text: 'negative balance', expected: 'NEGATIVE_BALANCE' },
  { text: 'what is my balance', expected: 'NET_BALANCE' },
  { text: 'balance', expected: 'NET_BALANCE' },
  { text: 'my balance', expected: 'NET_BALANCE' },
  { text: 'how much money do i have', expected: 'NET_BALANCE' },
  { text: 'my expenses', expected: 'TOTAL_EXPENSES' },
  { text: 'what are my expenses', expected: 'TOTAL_EXPENSES' },
  { text: 'what did i spend', expected: 'TOTAL_EXPENSES' },
  { text: 'expenses', expected: 'TOTAL_EXPENSES' },
  { text: 'spending', expected: 'TOTAL_EXPENSES' },
  { text: 'my income', expected: 'TOTAL_INCOME' },
  { text: 'salary', expected: 'TOTAL_INCOME' },
  { text: 'income', expected: 'TOTAL_INCOME' },
  { text: 'transactions', expected: 'RECENT_TRANSACTIONS' },
  { text: 'my transactions', expected: 'RECENT_TRANSACTIONS' },
  { text: 'recent transactions', expected: 'RECENT_TRANSACTIONS' },
  { text: 'my budgets', expected: 'BUDGET_STATUS' },
  { text: 'budgets', expected: 'BUDGET_STATUS' },
  { text: 'bills', expected: 'BILLS_AND_UTILITIES' },
  { text: 'subscriptions', expected: 'RECURRING_SUBSCRIPTIONS' },
  { text: 'Where did most of my money go this month?', expected: 'WHERE_DID_MONEY_GO' },
  { text: 'Can I afford a new phone worth ₹25,000?', expected: 'AFFORDABILITY' },
  { text: 'Why are my expenses increasing?', expected: 'WHY_EXPENSES_INCREASED' },
  { text: 'Compare my income and expenses over the last three months', expected: 'MULTI_MONTH_TREND' },
  { text: 'Which expenses can I reduce?', expected: 'REDUCE_EXPENSES' },
  { text: 'food', expected: 'CATEGORY_SPENDING' },
  { text: 'groceries', expected: 'CATEGORY_SPENDING' },
];

for (const tc of testCases) {
  const res = classifyFinancialIntent(tc.text);
  assert(res.intent === tc.expected, `Intent for "${tc.text}"`, `Got "${res.intent}", expected "${tc.expected}"`);
}

// 2. Test Multi-turn Context Resolution
console.log('\n--- Testing Multi-Turn Follow-Ups ---');
const contextWithFood = { lastCategory: 'Food', lastIntent: 'CATEGORY_SPENDING' };

const timeShift = classifyFinancialIntent('What about last month?', contextWithFood);
assert(timeShift.intent === 'CATEGORY_SPENDING', 'Follow-up "What about last month?" intent');
assert(timeShift.category === 'Food', 'Follow-up inherited lastCategory "Food"');

const whyIncrease = classifyFinancialIntent('Why did it increase?', contextWithFood);
assert(whyIncrease.intent === 'WHY_EXPENSES_INCREASED', 'Follow-up "Why did it increase?" intent');

console.log('\n======================================================');
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log('======================================================');

if (failed > 0) process.exit(1);
