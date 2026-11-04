import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = 5094;
process.env.PORT = String(PORT);

const { default: app } = await import('./src/server.js');
const { supabase } = await import('./src/config/supabase.js');

const apiCall = async (endpoint, method = 'GET', body = null, token = null) => {
  const res = await fetch(`http://localhost:${PORT}/api${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { status: res.status, data };
};

const runTests = async () => {
  // Give server a moment to start
  await new Promise((r) => setTimeout(r, 600));

  console.log('\n======================================================');
  console.log('🧪 FINNTRACK AI — TESTING MANUALLY TYPED PROMPTS & MULTI-TURN CONTEXT');
  console.log('======================================================\n');

  // 1. Create a test user
  const email = `typed_test_${Date.now()}@fintrack.test`;
  const reg = await apiCall('/auth/register', 'POST', {
    name: 'Chaitanya Test',
    email,
    password: 'Password123!',
  });

  if (reg.status !== 201) {
    console.error('❌ Failed to register test user:', reg.data);
    await stopServer();
    process.exit(1);
  }

  const token = reg.data.token;
  const userId = reg.data.user.id;
  console.log(`✅ Test user created: ${userId}`);

  // 2. Seed realistic transactions
  const now = new Date();
  const curMo = now.getMonth();
  const curYr = now.getFullYear();
  const prevDate = new Date(curYr, curMo - 1, 15);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const d1 = new Date(curYr, curMo, 1).toISOString().split('T')[0];
  const d2 = new Date(curYr, curMo, 2).toISOString().split('T')[0];
  const d3 = new Date(curYr, curMo, 3).toISOString().split('T')[0];
  const d4 = new Date(curYr, curMo, 4).toISOString().split('T')[0];

  const seedTxs = [
    { title: 'TechCorp Salary', amount: 85000, type: 'income', category: 'Salary', date: d1 },
    { title: 'Apartment Lease', amount: 18000, type: 'expense', category: 'Housing', date: d1 },
    { title: "Nature's Basket", amount: 3450, type: 'expense', category: 'Groceries', date: d2 },
    { title: 'Swiggy Gourmet Dining', amount: 2500, type: 'expense', category: 'Food', date: d3 },
    { title: 'Zomato Office Lunches', amount: 2000, type: 'expense', category: 'Food', date: d4 },
    { title: 'Previous Month TechCorp Salary', amount: 80000, type: 'income', category: 'Salary', date: prevDateStr },
    { title: 'Previous Month Rent', amount: 18000, type: 'expense', category: 'Housing', date: prevDateStr },
    { title: 'Previous Month Swiggy Food', amount: 3690, type: 'expense', category: 'Food', date: prevDateStr },
  ];

  for (const tx of seedTxs) {
    await apiCall('/transactions', 'POST', tx, token);
  }
  console.log(`✅ Seeded ${seedTxs.length} realistic income & expense records`);

  // Seed pending bill
  const billRes = await apiCall(
    '/bills',
    'POST',
    {
      provider: 'Tata Power',
      bill_type: 'Electricity',
      amount: 3400,
      due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      consumer_number: '1029384756',
    },
    token
  );
  if (billRes.status === 201) {
    console.log(`✅ Seeded upcoming utility bill (Tata Power: ₹3,400)\n`);
  } else {
    console.warn(`⚠️ Seed bill status: ${billRes.status}`, billRes.data);
  }

  // -------------------------------------------------------------
  // TEST SUITE A: 10 MANUALLY TYPED QUESTIONS
  // -------------------------------------------------------------
  const testQuestions = [
    {
      q: 'Where did most of my money go this month?',
      expectedKeywords: ['Housing', 'Food', '₹18,000'],
      desc: 'Top category and spending breakdown',
    },
    {
      q: 'How much did I spend on food last week?',
      expectedKeywords: ['Food', 'spent', 'transaction'],
      desc: 'Category spending in temporal window',
    },
    {
      q: 'Why are my expenses increasing?',
      expectedKeywords: ['Food', 'Housing', 'surge', 'increase'],
      desc: 'Causal root-cause analysis of expense spikes',
    },
    {
      q: 'Am I spending too much compared to my income?',
      expectedKeywords: ['Income', 'Expenses', '₹85,000', 'savings rate'],
      desc: 'Spending-to-income cash flow assessment',
    },
    {
      q: 'How much can I save this month?',
      expectedKeywords: ['burn rate', 'savings', 'Income'],
      desc: 'Projected monthly savings capacity',
    },
    {
      q: 'Which expenses can I reduce?',
      expectedKeywords: ['Food', 'save', 'trim', 'Discretionary'],
      desc: 'Actionable expense reduction plan',
    },
    {
      q: 'What are my five largest transactions?',
      expectedKeywords: ['Apartment Lease', '₹18,000'],
      desc: 'Top largest transactions',
    },
    {
      q: 'Compare my income and expenses over the last three months.',
      expectedKeywords: ['Income', 'Expense', 'Savings Rate'],
      desc: 'Multi-month cash flow trajectory',
    },
    {
      q: 'Can I afford a new phone worth ₹25,000?',
      expectedKeywords: ['Affordability', '₹25,000', 'Available Balance'],
      desc: 'Purchase affordability evaluation',
    },
    {
      q: 'Explain my current financial situation.',
      expectedKeywords: ['Cash Flow', 'Net', 'Bills', 'Guidance'],
      desc: 'Holistic financial situation report',
    },
  ];

  let testPassed = 0;
  let testFailed = 0;

  for (let idx = 0; idx < testQuestions.length; idx++) {
    const item = testQuestions[idx];
    console.log(`--- [Test ${idx + 1}/10] "${item.q}" (${item.desc}) ---`);
    const tStart = Date.now();
    const res = await apiCall('/ai/chat', 'POST', { message: item.q }, token);
    const duration = Date.now() - tStart;

    if (res.status !== 200) {
      console.error(`❌ HTTP Error ${res.status}:`, res.data);
      testFailed++;
      continue;
    }

    const content = res.data.message?.content || '';
    const insights = res.data.insights || [];
    const followUps = res.data.suggestedQuestions || [];

    // Verify content is not generic fallback
    const isGenericFallback = content.includes('How can I assist your financial planning today? You can ask me to evaluate a purchase');
    const hasExpectedKeyword = item.expectedKeywords.some((kw) => content.toLowerCase().includes(kw.toLowerCase()));

    if (isGenericFallback) {
      console.error(`❌ FAILED: Received generic repeated fallback for "${item.q}"`);
      testFailed++;
    } else if (!hasExpectedKeyword) {
      console.error(`❌ FAILED: Response missing expected keywords [${item.expectedKeywords.join(', ')}]`);
      console.log('Actual response snippet:', content.slice(0, 150));
      testFailed++;
    } else {
      console.log(`✅ PASS (${duration}ms)`);
      console.log(`   Insight: ${insights[0]?.title || 'None'}`);
      console.log(`   Snippet: ${content.replace(/\n+/g, ' ').slice(0, 110)}...`);
      console.log(`   Follow-ups (${followUps.length}): "${followUps[0]}"`);
      testPassed++;
    }
    console.log('');
  }

  // -------------------------------------------------------------
  // TEST SUITE B: MULTI-TURN CONVERSATION FOLLOW-UP FLOW
  // -------------------------------------------------------------
  console.log('\n======================================================');
  console.log('🔄 TESTING MULTI-TURN CONTEXT & FOLLOW-UP CONTINUITY');
  console.log('======================================================\n');

  // Create dedicated conversation session for follow-up testing
  const convRes = await apiCall('/ai/conversations', 'POST', { title: 'Food Spending Deep Dive' }, token);
  const conversationId = convRes.data.data.id;
  console.log(`Created conversation session: ${conversationId}`);

  // Turn 1: "How much did I spend on food this month?"
  console.log('\n[Turn 1] User: "How much did I spend on food this month?"');
  const turn1 = await apiCall('/ai/chat', 'POST', { conversationId, message: 'How much did I spend on food this month?' }, token);
  const c1 = turn1.data.message?.content || '';
  console.log(`AI [Turn 1 Response]: ${c1.replace(/\n+/g, ' ').slice(0, 130)}...`);
  const turn1Valid = c1.includes('Food') && c1.includes('4,500');
  if (turn1Valid) {
    console.log('✅ Turn 1 PASSED: Correctly identified ₹4,500 on Food this month');
    testPassed++;
  } else {
    console.error('❌ Turn 1 FAILED');
    testFailed++;
  }

  // Turn 2: "What about last month?" (Follow-up)
  console.log('\n[Turn 2] User: "What about last month?" (inherits Food context)');
  const turn2 = await apiCall('/ai/chat', 'POST', { conversationId, message: 'What about last month?' }, token);
  const c2 = turn2.data.message?.content || '';
  console.log(`AI [Turn 2 Response]: ${c2.replace(/\n+/g, ' ').slice(0, 130)}...`);
  const turn2Valid = (c2.includes('Food') || c2.includes('food')) && (c2.includes('3,690') || c2.includes('last month'));
  const turn2NotGeneric = !c2.includes('How can I assist your financial planning today?');
  if (turn2Valid && turn2NotGeneric) {
    console.log('✅ Turn 2 PASSED: Inherited "Food" category and evaluated last month spending');
    testPassed++;
  } else {
    console.error('❌ Turn 2 FAILED: Returned generic fallback or lost Food context');
    testFailed++;
  }

  // Turn 3: "Why did it increase?" (Causal Follow-up)
  console.log('\n[Turn 3] User: "Why did it increase?" (causal root-cause for food surge)');
  const turn3 = await apiCall('/ai/chat', 'POST', { conversationId, message: 'Why did it increase?' }, token);
  const c3 = turn3.data.message?.content || '';
  console.log(`AI [Turn 3 Response]: ${c3.replace(/\n+/g, ' ').slice(0, 140)}...`);
  const turn3Valid = (c3.includes('Food') || c3.includes('food')) && (c3.includes('rose') || c3.includes('increased') || c3.includes('Swiggy') || c3.includes('Zomato'));
  const turn3NotGeneric = !c3.includes('How can I assist your financial planning today?');
  if (turn3Valid && turn3NotGeneric) {
    console.log('✅ Turn 3 PASSED: Provided exact causal drivers for food expense increase');
    testPassed++;
  } else {
    console.error('❌ Turn 3 FAILED: Returned generic fallback or lost causal context');
    testFailed++;
  }

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
  console.log('======================================================\n');

  // Teardown
  try {
    await supabase.from('transactions').delete().eq('user_id', userId);
    await supabase.from('bills').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
    console.log('🧹 Purged test user and transactions');
  } catch {}

  process.exit(testFailed > 0 ? 1 : 0);
};

runTests().catch(async (e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
