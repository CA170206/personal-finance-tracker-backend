/**
 * FinTrack AI — Comprehensive Automated Integration Test Suite
 *
 * Tests:
 * 1. Multi-user authentication & AI conversation isolation
 * 2. Conversational chat & dynamic tool calling execution
 * 3. Affordability calculator & deterministic calculations
 * 4. Month-over-month spending comparison & category breakdown
 * 5. Action proposal security guardrail (confirmation required before mutation)
 * 6. Action execution confirms and mutates Supabase database
 * 7. Adaptive user financial memory & feedback loop
 * 8. Proactive alerts generation & 24h deduplication
 * 9. Multi-tenant security isolation (User B cannot access or confirm User A proposal)
 * 10. Clean database teardown
 */

import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const TEST_PORT = 5092;
process.env.PORT = String(TEST_PORT);

// Dynamic import of app to bind to test port
const { default: app } = await import('./src/server.js');
const { supabase } = await import('./src/config/supabase.js');

const BASE_URL = `http://localhost:${TEST_PORT}/api`;

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${details}`);
    failed++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('🚀 RUNNING FINTRACK AI SYSTEM INTEGRATION TESTS');
  console.log('=============================================================\n');

  let server;
  const userA_email = `ai_test_userA_${Date.now()}@fintrack.test`;
  const userB_email = `ai_test_userB_${Date.now()}@fintrack.test`;
  let userA = null;
  let userB = null;

  try {
    // Server is already listening on TEST_PORT via import of src/server.js
    await new Promise((resolve) => setTimeout(resolve, 500));

    // --- SECTION 1: Multi-User Authentication ---
    console.log('--- SECTION 1: Multi-User Authentication ---');
    const regA = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Aarav Sharma',
        email: userA_email,
        password: 'Password123!',
      }),
    });
    assert(regA.status === 201 && regA.data.token, 'Register User A (Aarav)');
    userA = regA.data;

    const regB = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Diya Patel',
        email: userB_email,
        password: 'Password123!',
      }),
    });
    assert(regB.status === 201 && regB.data.token, 'Register User B (Diya)');
    userB = regB.data;

    // Seed User A with realistic financial records
    console.log('\n--- SECTION 2: Seeding User A Financial Data ---');
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = String(today.getMonth() + 1).padStart(2, '0');
    const prevMonth = String(today.getMonth() === 0 ? 12 : today.getMonth()).padStart(2, '0');
    const prevYear = today.getMonth() === 0 ? curYear - 1 : curYear;

    // Income: Salary ₹75,000
    await request('/transactions', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        title: 'Tech Consulting Salary',
        amount: 75000,
        type: 'income',
        category: 'Salary',
        date: `${curYear}-${curMonth}-01`,
      }),
    });

    // Expenses current month
    await request('/transactions', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        title: 'Apartment Monthly Rent',
        amount: 22000,
        type: 'expense',
        category: 'Housing',
        date: `${curYear}-${curMonth}-02`,
      }),
    });

    await request('/transactions', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        title: 'Swiggy Dinner Feast',
        amount: 1850,
        type: 'expense',
        category: 'Food',
        date: `${curYear}-${curMonth}-05`,
      }),
    });

    await request('/transactions', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        title: 'Netflix Subscription',
        amount: 649,
        type: 'expense',
        category: 'Entertainment',
        date: `${curYear}-${curMonth}-07`,
      }),
    });

    // Expenses previous month
    await request('/transactions', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        title: 'Last Month Dining',
        amount: 3200,
        type: 'expense',
        category: 'Food',
        date: `${prevYear}-${prevMonth}-15`,
      }),
    });

    // Seed a pending bill
    const billRes = await request('/bills', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        provider: 'Tata Power Electricity',
        bill_type: 'Electricity',
        amount: 3400,
        due_date: `${curYear}-${curMonth}-28`,
        billing_period: 'monthly',
      }),
    });
    assert(billRes.status === 201, 'Seed Pending Electricity Bill for User A');

    // --- SECTION 3: Dynamic Tool Calling & Chat ---
    console.log('\n--- SECTION 3: Conversational Chat & Dynamic Tool Calling ---');
    const chat1 = await request('/ai/chat', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        message: 'How much did I spend on Food this month?',
      }),
    });

    assert(chat1.status === 200, 'Chat endpoint returns HTTP 200');
    assert(chat1.data.conversationId, 'Conversation ID created and returned');
    assert(chat1.data.message && chat1.data.message.content.includes('Food'), 'AI response correctly references Food category');
    assert(chat1.data.message.content.includes('1,850'), 'AI response calculates exact Food spend (₹1,850)');
    const conversationId = chat1.data.conversationId;

    // Follow-up question in the same conversation
    const chat2 = await request('/ai/chat', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        conversationId,
        message: 'Compare my spending with last month',
      }),
    });

    assert(chat2.status === 200, 'Follow-up chat processed successfully');
    assert(chat2.data.message.content.includes('Comparison') || chat2.data.message.content.includes('Expenses'), 'Monthly comparison computed and returned');

    // Affordability Analysis tool call
    console.log('\n--- SECTION 4: Affordability Intelligence ---');
    const chatAfford = await request('/ai/chat', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        conversationId,
        message: 'Can I afford a ₹15,000 Apple Watch?',
      }),
    });

    assert(chatAfford.status === 200, 'Affordability question processed');
    assert(
      chatAfford.data.message.content.includes('Affordability') ||
        chatAfford.data.message.content.includes('15,000'),
      'AI computes affordability assessment for ₹15,000'
    );
    assert(
      chatAfford.data.insights && chatAfford.data.insights.some((i) => i.type === 'affordability_meter'),
      'Interactive Affordability Meter insight card generated'
    );

    // --- SECTION 5: Security Guardrail & Action Proposals ---
    console.log('\n--- SECTION 5: Action Proposals & Security Guardrail ---');
    const chatBudget = await request('/ai/chat', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        conversationId,
        message: 'Create a monthly Food budget of ₹6,000',
      }),
    });

    assert(chatBudget.status === 200, 'Budget creation request handled via Proposal');
    assert(
      chatBudget.data.proposals && chatBudget.data.proposals.length > 0,
      'AI created non-destructive Action Proposal requiring confirmation'
    );
    const proposal = chatBudget.data.proposals[0];
    assert(proposal.actionType === 'create_budget', 'Proposal actionType is create_budget');
    assert(proposal.status === 'pending_user_confirmation', 'Proposal status is pending user confirmation');

    // User B tries to confirm User A's proposal (Unauthorized attack)
    const attackConfirm = await request(`/ai/proposals/${proposal.proposalId}/execute`, {
      method: 'POST',
      token: userB.token,
    });
    assert(attackConfirm.status === 404, 'Multi-User Isolation: User B cannot confirm User A proposal');

    // User A confirms their proposal
    const validConfirm = await request(`/ai/proposals/${proposal.proposalId}/execute`, {
      method: 'POST',
      token: userA.token,
    });
    assert(validConfirm.status === 200, 'User A explicitly confirms and executes action proposal');

    // Verify database was actually mutated
    const budgetsCheck = await request('/budgets', {
      method: 'GET',
      token: userA.token,
    });
    const foodBudget = (budgetsCheck.data || []).find((b) => b.category === 'Food');
    assert(foodBudget && foodBudget.allocated === 6000, 'Database verification: Food budget of ₹6,000 created in Supabase');

    // --- SECTION 6: Conversation History & Multi-Session ---
    console.log('\n--- SECTION 6: Conversation Sessions & History ---');
    const convsRes = await request('/ai/conversations', {
      method: 'GET',
      token: userA.token,
    });
    assert(convsRes.status === 200 && convsRes.data.data.length >= 1, 'List user conversation sessions');

    const historyRes = await request(`/ai/conversations/${conversationId}`, {
      method: 'GET',
      token: userA.token,
    });
    assert(historyRes.status === 200, 'Retrieve conversation message history');
    assert(historyRes.data.messages.length >= 6, 'All user and assistant turns preserved in conversation history');

    // User B cannot access User A's conversation
    const isolationConv = await request(`/ai/conversations/${conversationId}`, {
      method: 'GET',
      token: userB.token,
    });
    assert(isolationConv.status === 404, 'Multi-User Isolation: User B cannot read User A conversation history');

    // --- SECTION 7: Adaptive Memory & Feedback ---
    console.log('\n--- SECTION 7: Adaptive Memory & Feedback Loop ---');
    const memoryRes = await request('/ai/memory', {
      method: 'GET',
      token: userA.token,
    });
    assert(memoryRes.status === 200, 'Get user persistent financial memory');

    const feedbackRes = await request('/ai/feedback', {
      method: 'POST',
      token: userA.token,
      body: JSON.stringify({
        rating: 'helpful',
        recommendationKey: 'food_budget_6000',
        userComment: 'Perfect limit for dining out.',
      }),
    });
    assert(feedbackRes.status === 201, 'Submit feedback on recommendation');

    // --- SECTION 8: Proactive Alerts Scanner ---
    console.log('\n--- SECTION 8: Proactive Alerts Scanner & Deduplication ---');
    const alertScan1 = await request('/ai/alerts/scan', {
      method: 'POST',
      token: userA.token,
    });
    assert(alertScan1.status === 200, 'Proactive alerts scan completed');

    // Run again immediately to verify deduplication
    const alertScan2 = await request('/ai/alerts/scan', {
      method: 'POST',
      token: userA.token,
    });
    assert(alertScan2.status === 200 && alertScan2.data.generatedCount === 0, 'Deduplication: No duplicate alerts created within 24h window');

    // --- SECTION 9: Dynamic Question Suggestions ---
    console.log('\n--- SECTION 9: Contextual Question Suggestions ---');
    const suggestionsRes = await request('/ai/suggestions', {
      method: 'GET',
      token: userA.token,
    });
    assert(suggestionsRes.status === 200 && suggestionsRes.data.data.length > 0, 'Dynamic suggestions generated based on user data');

    console.log('\n=============================================================');
    console.log(`TEST RUN COMPLETED: ${passed} Passed, ${failed} Failed`);
    console.log('=============================================================\n');
  } catch (err) {
    console.error('Test run crashed with error:', err);
    failed++;
  } finally {
    // Teardown test accounts
    console.log('--- CLEAN TEARDOWN ---');
    if (userA && userA.user?.id) {
      await supabase.from('transactions').delete().eq('user_id', userA.user.id);
      await supabase.from('budgets').delete().eq('user_id', userA.user.id);
      await supabase.from('bills').delete().eq('user_id', userA.user.id);
      await supabase.from('notifications').delete().eq('user_id', userA.user.id);
      await supabase.from('users').delete().eq('id', userA.user.id);
    }
    if (userB && userB.user?.id) {
      await supabase.from('transactions').delete().eq('user_id', userB.user.id);
      await supabase.from('budgets').delete().eq('user_id', userB.user.id);
      await supabase.from('bills').delete().eq('user_id', userB.user.id);
      await supabase.from('notifications').delete().eq('user_id', userB.user.id);
      await supabase.from('users').delete().eq('id', userB.user.id);
    }
    console.log('  🧹 Purged test users and records.');

    if (server) {
      server.close();
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
