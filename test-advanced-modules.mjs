/**
 * FinTrack PRO — Advanced Finance Modules Automated Integration Test Suite
 *
 * Tests:
 * 1. User registration & authentication (Multi-user)
 * 2. Bank Accounts CRUD & masking
 * 3. Bills & Utilities CRUD, AES-256-GCM encryption, & Mark-as-paid flow
 * 4. Notifications & Smart Reminders generation
 * 5. CSV Import, validation, duplicate detection, & sync_logs audit
 * 6. Multi-user tenant isolation
 * 7. UPI payment method filtering
 * 8. Core dashboard & auth regressions
 * 9. Clean database teardown
 */

import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const TEST_PORT = 5091;
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
  } catch (e) {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('🚀 RUNNING FINTRACK PRO ADVANCED MODULES INTEGRATION TESTS');
  console.log('=============================================================\n');

  const testId = Date.now();
  const userAEmail = `rohan.test.${testId}@fintrack.io`;
  const userBEmail = `priya.test.${testId}@fintrack.io`;

  let tokenA = null;
  let userAId = null;
  let tokenB = null;
  let userBId = null;

  try {
    // -------------------------------------------------------------
    // TEST SECTION 1: AUTHENTICATION & MULTI-USER SETUP
    // -------------------------------------------------------------
    console.log('--- SECTION 1: Multi-User Authentication ---');
    const regA = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Rohan Sharma',
        email: userAEmail,
        password: 'Password@123',
      }),
    });
    assert(regA.status === 201 && regA.data.token, 'Register User A (Rohan)');
    tokenA = regA.data.token;
    userAId = regA.data.user.id;

    const regB = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Priya Patel',
        email: userBEmail,
        password: 'Password@123',
      }),
    });
    assert(regB.status === 201 && regB.data.token, 'Register User B (Priya)');
    tokenB = regB.data.token;
    userBId = regB.data.user.id;

    // -------------------------------------------------------------
    // TEST SECTION 2: BANK ACCOUNTS CRUD & SECURITY
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: Bank Accounts CRUD & Masking ---');
    let createdBankId = null;

    // 2.1 Add Bank Account Manually
    const addBankRes = await request('/bank-accounts', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({
        institution_name: 'HDFC Bank',
        account_holder: 'Rohan Sharma',
        account_type: 'Savings',
        account_number: '123456789012',
        balance: 85000,
      }),
    });
    assert(
      addBankRes.status === 201 && addBankRes.data.success,
      'Create Bank Account (HDFC Bank)',
      JSON.stringify(addBankRes.data)
    );
    createdBankId = addBankRes.data.data.id;
    assert(
      addBankRes.data.data.masked_account_number.includes('9012'),
      'Account number masked properly in response',
      addBankRes.data.data.masked_account_number
    );
    assert(
      addBankRes.data.data.balance === 85000,
      'Balance returned correctly',
      `Got: ${addBankRes.data.data.balance}`
    );

    // 2.2 Verify User B cannot access User A's bank account
    const leakBankRes = await request(`/bank-accounts/${createdBankId}`, {
      method: 'GET',
      token: tokenB,
    });
    assert(
      leakBankRes.status === 404,
      'Multi-User Isolation: User B cannot access User A bank account',
      `Status: ${leakBankRes.status}`
    );

    // 2.3 Update Bank Account
    const updateBankRes = await request(`/bank-accounts/${createdBankId}`, {
      method: 'PUT',
      token: tokenA,
      body: JSON.stringify({
        balance: 90000,
        account_type: 'Salary',
      }),
    });
    assert(
      updateBankRes.status === 200 && updateBankRes.data.data.balance === 90000,
      'Update Bank Account Balance & Type',
      JSON.stringify(updateBankRes.data)
    );

    // 2.4 List Bank Accounts
    const listBankRes = await request('/bank-accounts', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      listBankRes.status === 200 && listBankRes.data.data.length === 1,
      'List User Bank Accounts returns 1 account',
      `Length: ${listBankRes.data?.data?.length}`
    );
    assert(
      listBankRes.data.total_balance === 90000,
      'Total bank balance calculated correctly'
    );

    // -------------------------------------------------------------
    // TEST SECTION 3: BILLS & UTILITIES & AES-256 ENCRYPTION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: Bills & Utilities CRUD & AES-256 Encryption ---');
    let createdBillId = null;
    const rawConsumerNum = '10029384756';

    // 3.1 Create Bill
    const createBillRes = await request('/bills', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({
        bill_type: 'Electricity',
        provider: 'Tata Power',
        consumer_number: rawConsumerNum,
        amount: 2450,
        due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        billing_period: 'monthly',
      }),
    });
    assert(
      createBillRes.status === 201 && createBillRes.data.success,
      'Create Electricity Bill (Tata Power)',
      JSON.stringify(createBillRes.data)
    );
    createdBillId = createBillRes.data.data.id;
    assert(
      createBillRes.data.data.masked_consumer_number.includes('4756'),
      'Consumer number masked in API response',
      createBillRes.data.data.masked_consumer_number
    );

    // 3.2 Verify AES-256-GCM Encryption directly in Supabase table
    const { data: dbBill } = await supabase
      .from('bills')
      .select('encrypted_consumer_number')
      .eq('id', createdBillId)
      .single();

    assert(
      dbBill &&
        dbBill.encrypted_consumer_number &&
        dbBill.encrypted_consumer_number.includes(':') &&
        !dbBill.encrypted_consumer_number.includes(rawConsumerNum),
      'Sensitive consumer number is securely encrypted with AES-256-GCM in database',
      `Encrypted string: ${dbBill?.encrypted_consumer_number}`
    );

    // 3.3 Verify User B cannot access User A's bill
    const leakBillRes = await request(`/bills/${createdBillId}`, {
      method: 'GET',
      token: tokenB,
    });
    assert(
      leakBillRes.status === 404,
      'Multi-User Isolation: User B cannot access User A bill',
      `Status: ${leakBillRes.status}`
    );

    // 3.4 Bills Summary
    const billSummaryRes = await request('/bills/summary', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      billSummaryRes.status === 200 && billSummaryRes.data.summary.total_pending === 2450,
      'Bill Summary reflects pending amount ₹2,450'
    );

    // 3.5 Mark Bill as Paid with expense transaction log
    const payBillRes = await request(`/bills/${createdBillId}/pay`, {
      method: 'PATCH',
      token: tokenA,
      body: JSON.stringify({
        logTransaction: true,
        payment_method: 'UPI',
      }),
    });
    assert(
      payBillRes.status === 200 && payBillRes.data.data.status === 'paid',
      'Mark Bill Paid updates status to paid'
    );
    assert(
      payBillRes.data.transaction_id !== null,
      'Expense transaction automatically created for paid bill',
      `Tx ID: ${payBillRes.data.transaction_id}`
    );

    // -------------------------------------------------------------
    // TEST SECTION 4: NOTIFICATIONS & REMINDERS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: Notifications & Smart Reminders ---');

    // Create an overdue bill to test overdue reminder generator
    const overdueBillRes = await request('/bills', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({
        bill_type: 'Broadband',
        provider: 'Airtel Xstream',
        consumer_number: '9876543210',
        amount: 999,
        due_date: '2026-01-01', // intentionally past due
        billing_period: 'monthly',
      }),
    });
    assert(overdueBillRes.status === 201, 'Create overdue bill for reminder test');

    // Generate reminders
    const remindersRes = await request('/notifications/generate-reminders', {
      method: 'POST',
      token: tokenA,
    });
    assert(
      remindersRes.status === 200 && remindersRes.data.success,
      'Smart Reminder Engine evaluated reminders'
    );

    // Get notifications
    const getNotifsRes = await request('/notifications', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      getNotifsRes.status === 200 && getNotifsRes.data.data.length > 0,
      'Notifications retrieved including overdue alert',
      `Count: ${getNotifsRes.data.data.length}`
    );
    const testNotifId = getNotifsRes.data.data[0].id;

    // Mark single notification read
    const markReadRes = await request(`/notifications/${testNotifId}/read`, {
      method: 'PATCH',
      token: tokenA,
    });
    assert(
      markReadRes.status === 200 && markReadRes.data.data.is_read === true,
      'Mark single notification read'
    );

    // Mark all read
    const markAllReadRes = await request('/notifications/read-all', {
      method: 'PATCH',
      token: tokenA,
    });
    assert(markAllReadRes.status === 200, 'Mark all notifications read');

    // Unread count check
    const unreadCountRes = await request('/notifications/unread-count', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      unreadCountRes.status === 200 && unreadCountRes.data.unread_count === 0,
      'Unread notification count correctly reports 0 after markAllRead'
    );

    // -------------------------------------------------------------
    // TEST SECTION 5: CSV IMPORT & DUPLICATE DETECTION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: CSV Import Center & Duplicate Detection ---');

    const sampleCsv = `Date,Merchant,Amount,Type,Category,Provider,Reference_ID
2026-11-01,Swiggy Order,480,expense,Food & Dining,Google Pay,UPI-SWG-001
2026-11-02,Coffee Day,220,expense,Food & Dining,PhonePe,UPI-CCD-002
2026-11-03,Monthly Stipend,15000,income,Salary,Paytm,UPI-STP-003`;

    // 5.1 Preview CSV
    const previewRes = await request('/import/preview', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({
        csvText: sampleCsv,
        provider: 'Google Pay',
      }),
    });
    assert(
      previewRes.status === 200 && previewRes.data.summary.valid_count === 3,
      'Preview CSV detects 3 valid rows',
      JSON.stringify(previewRes.data.summary)
    );

    // 5.2 Execute Import
    const importRes = await request('/import/transactions', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({
        csvText: sampleCsv,
        provider: 'Google Pay',
        skipDuplicates: true,
      }),
    });
    assert(
      importRes.status === 200 && importRes.data.summary.imported === 3,
      'Execute Import imports 3 transactions into Supabase',
      JSON.stringify(importRes.data.summary)
    );

    // 5.3 Attempt duplicate import (exact same statement)
    const duplicateImportRes = await request('/import/transactions', {
      method: 'POST',
      token: tokenA,
      body: JSON.stringify({
        csvText: sampleCsv,
        provider: 'Google Pay',
        skipDuplicates: true,
      }),
    });
    assert(
      duplicateImportRes.status === 200 &&
        duplicateImportRes.data.summary.imported === 0 &&
        duplicateImportRes.data.summary.duplicates === 3,
      'Duplicate Detection: Successfully detected and skipped 3 duplicate transactions',
      JSON.stringify(duplicateImportRes.data.summary)
    );

    // 5.4 Check sync_logs audit history
    const syncLogsRes = await request('/import/history', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      syncLogsRes.status === 200 && syncLogsRes.data.data.length >= 2,
      'Sync Logs recorded audit entries for imports',
      `Logs count: ${syncLogsRes.data?.data?.length}`
    );

    // -------------------------------------------------------------
    // TEST SECTION 6: UPI & PAYMENT METHOD FILTERING
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: UPI Provider Filtering ---');
    const upiFilterRes = await request('/transactions?payment_method=Google Pay', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      upiFilterRes.status === 200 && upiFilterRes.data.data.length > 0,
      'Filter transactions by provider (Google Pay) returns matching records',
      `Count: ${upiFilterRes.data.data.length}`
    );

    // -------------------------------------------------------------
    // TEST SECTION 7: CORE REGRESSION VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: Core System Regressions ---');
    const dashSummaryRes = await request('/dashboard/summary', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      dashSummaryRes.status === 200 && dashSummaryRes.data.totalIncome > 0,
      'Dashboard Summary operates seamlessly with imported and bill transactions',
      `Income: ${dashSummaryRes.data.totalIncome}, Expenses: ${dashSummaryRes.data.totalExpenses}`
    );

    const userProfileRes = await request('/auth/me', {
      method: 'GET',
      token: tokenA,
    });
    assert(
      userProfileRes.status === 200 && userProfileRes.data.email === userAEmail,
      'GET /api/auth/me restores authenticated session'
    );
  } finally {
    // -------------------------------------------------------------
    // CLEAN TEARDOWN
    // -------------------------------------------------------------
    console.log('\n--- CLEAN TEARDOWN ---');
    if (userAId || userBId) {
      const userIds = [userAId, userBId].filter(Boolean);
      for (const uid of userIds) {
        await supabase.from('notifications').delete().eq('user_id', uid);
        await supabase.from('sync_logs').delete().eq('user_id', uid);
        await supabase.from('bills').delete().eq('user_id', uid);
        await supabase.from('bank_accounts').delete().eq('user_id', uid);
        await supabase.from('transactions').delete().eq('user_id', uid);
        await supabase.from('budgets').delete().eq('user_id', uid);
        await supabase.from('users').delete().eq('id', uid);
      }
      console.log('  🧹 Purged all test users and records from Supabase database.');
    }
  }

  console.log('\n=============================================================');
  console.log(`TEST RUN COMPLETED: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test run crashed with error:', err);
  process.exit(1);
});
