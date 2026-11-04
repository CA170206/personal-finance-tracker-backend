import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = 5098;
process.env.PORT = String(PORT);

const { default: app } = await import('./src/server.js');

await new Promise((r) => setTimeout(r, 500));

console.log(`Debug server running on port ${PORT}`);

const queries = [
  'Compare this month with last month',
  'How much did I spend on food this month?',
  'What were my biggest expenses?',
  'Can I afford a ₹10,000 purchase?',
  'Which bills are due next week?',
  'Identify my recurring subscriptions.',
];

try {
  // 1. Register test user
  const regRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Query Test User',
      email: `query_test_${Date.now()}@fintrack.test`,
      password: 'Password123!',
    }),
  });
  const regData = await regRes.json();
  const token = regData.token;
  console.log('User registered with token');

  // 2. Seed comprehensive realistic financial records
  const now = new Date();
  const curY = now.getFullYear();
  const curM = String(now.getMonth() + 1).padStart(2, '0');
  const prevM = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0');
  const prevY = now.getMonth() === 0 ? curY - 1 : curY;

  const testTx = [
    { title: 'Tech Monthly Salary', amount: 80000, type: 'income', category: 'Salary', date: `${curY}-${curM}-01` },
    { title: 'Swiggy Gourmet Feast', amount: 1450, type: 'expense', category: 'Food', date: `${curY}-${curM}-02` },
    { title: 'Zomato Biryani Lunch', amount: 950, type: 'expense', category: 'Food', date: `${curY}-${curM}-04` },
    { title: 'Blinkit Grocery Order', amount: 2200, type: 'expense', category: 'Food', date: `${curY}-${curM}-06` },
    { title: 'Apartment Monthly Rent', amount: 20000, type: 'expense', category: 'Housing', date: `${curY}-${curM}-03` },
    { title: 'Netflix Standard HD', amount: 499, type: 'expense', category: 'Entertainment', date: `${curY}-${curM}-05` },
    { title: 'Spotify Premium Family', amount: 179, type: 'expense', category: 'Entertainment', date: `${curY}-${curM}-07` },
    { title: 'Amazon Electronics Gadget', amount: 7500, type: 'expense', category: 'Shopping', date: `${curY}-${curM}-08` },
    // Previous month records
    { title: 'Prev Month Salary', amount: 80000, type: 'income', category: 'Salary', date: `${prevY}-${prevM}-01` },
    { title: 'Prev Swiggy', amount: 1800, type: 'expense', category: 'Food', date: `${prevY}-${prevM}-05` },
    { title: 'Prev Rent', amount: 20000, type: 'expense', category: 'Housing', date: `${prevY}-${prevM}-03` },
    { title: 'Netflix Standard HD', amount: 499, type: 'expense', category: 'Entertainment', date: `${prevY}-${prevM}-05` },
  ];

  for (const t of testTx) {
    await fetch(`http://localhost:${PORT}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(t),
    });
  }

  // Seed pending bill due next week
  const nextWeekDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const billRes = await fetch(`http://localhost:${PORT}/api/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      provider: 'Tata Power Mumbai',
      bill_type: 'Electricity',
      category: 'Electricity',
      amount: 2850,
      due_date: nextWeekDate,
      consumer_number: 'TP-1234-9876',
      status: 'pending',
    }),
  });
  console.log('Seed Bill status:', billRes.status);

  console.log('Seeded transactions and bills. Running 6 test queries...\n');

  let convId = null;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`=======================================================`);
    console.log(`QUERY ${i + 1}: "${q}"`);
    console.log(`=======================================================`);

    const tStart = Date.now();
    const res = await fetch(`http://localhost:${PORT}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        conversationId: convId,
        message: q,
      }),
    });
    const tElapsed = Date.now() - tStart;
    const status = res.status;
    const body = await res.json();

    if (body.conversationId) convId = body.conversationId;

    console.log(`Status: ${status} in ${tElapsed}ms`);
    if (status !== 200) {
      console.error('ERROR RESPONSE:', body);
    } else {
      console.log('Assistant Answer Preview:');
      console.log(body.message?.content?.slice(0, 300) + '...');
      console.log('Tool Calls:', body.message?.tool_calls?.map((tc) => tc.tool));
      console.log('Insights Types:', body.insights?.map((ins) => ins.type));
    }
    console.log('');
  }
} catch (err) {
  console.error('Query test suite crashed:', err);
} finally {
  process.exit(0);
}
