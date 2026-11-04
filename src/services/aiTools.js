import { supabase } from '../config/supabase.js';
import {
  detectAnomalousExpenses,
  detectRecurringExpenses,
  estimateMonthEndSpending,
  compareMonthlySpending,
  analyzeAffordability,
  identifySavingsOpportunities,
} from './financialIntelligence.js';
import { aiStore } from './aiStore.js';
import { calculateFinancialSummary } from '../utils/calculations.js';

/**
 * Registry of available tools for FinTrack AI
 * Every tool enforces strict multi-tenant isolation by requiring userId.
 */
export const toolDefinitions = [
  {
    name: 'searchTransactions',
    description: 'Search authenticated user transactions by keyword, category, type, date range, or limit.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to search in title or notes' },
        category: { type: 'string', description: 'Category name (e.g. Food, Groceries, Rent, Utilities, Salary)' },
        type: { type: 'string', enum: ['income', 'expense', 'all'], description: 'Transaction type' },
        startDate: { type: 'string', description: 'ISO start date YYYY-MM-DD' },
        endDate: { type: 'string', description: 'ISO end date YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max records to return (default 25)' },
      },
    },
  },
  {
    name: 'getSpendingByCategory',
    description: 'Calculate spending breakdown by category with amounts and percentage distribution for the user.',
    parameters: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Optional start date YYYY-MM-DD' },
        endDate: { type: 'string', description: 'Optional end date YYYY-MM-DD' },
        month: { type: 'number', description: 'Optional 0-indexed month (0=Jan, 11=Dec)' },
        year: { type: 'number', description: 'Optional 4-digit year' },
      },
    },
  },
  {
    name: 'getSpendingByMerchant',
    description: 'Find all transactions and total spend for a specific merchant or store name.',
    parameters: {
      type: 'object',
      properties: {
        merchant: { type: 'string', description: 'Merchant or store name to search (e.g. Swiggy, Zomato, Amazon, Uber)' },
      },
      required: ['merchant'],
    },
  },
  {
    name: 'compareMonthlySpending',
    description: 'Compare current month expenses vs previous month, highlighting percentage difference and category deltas.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'getIncomeHistory',
    description: 'Retrieve user income transactions, primary earnings sources, and total income trends.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent income records to fetch' },
      },
    },
  },
  {
    name: 'getBankAccounts',
    description: 'Retrieve recorded bank accounts and manually entered balances. Note: balances are user-recorded, not live synced.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'getUpiTransactions',
    description: 'Retrieve UPI payment records filtered by payment provider (e.g. Google Pay, PhonePe, Paytm, Other).',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Payment provider name (Google Pay, PhonePe, Paytm, Other)' },
      },
    },
  },
  {
    name: 'getBudgets',
    description: 'Retrieve user category budgets and overall budget with allocated limits and current spending progress.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'getBills',
    description: 'Retrieve upcoming, overdue, and paid utility bills with due dates, providers, and amounts.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'pending', 'overdue', 'paid'], description: 'Filter by bill status' },
      },
    },
  },
  {
    name: 'getDashboardSummary',
    description: 'Retrieve comprehensive financial overview: net ledger balance, total income, total expense, and savings rate.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'analyzeAffordability',
    description: 'Calculate whether user can safely afford a planned purchase after reserving funds for upcoming bills and monthly living expenses.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Cost of planned purchase in INR' },
        itemDescription: { type: 'string', description: 'Name or description of purchase item' },
        category: { type: 'string', description: 'Relevant category (e.g. Electronics, Shopping, Travel)' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'detectRecurringExpenses',
    description: 'Detect repeating subscriptions, recurring bills, and regular commitments from transaction history.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'detectAnomalousExpenses',
    description: 'Detect unusually high or unexpected expenses that deviate significantly from average spending habits.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'estimateMonthEndSpending',
    description: 'Estimate month-end projected spending and remaining cash balance based on current month daily burn rate.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'identifySavingsOpportunities',
    description: 'Identify actionable opportunities to save money based on budget overruns and discretionary spending trims.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'proposeAction',
    description: 'Propose a financial action (create budget, create transaction, create bill) for user confirmation. DOES NOT mutate directly.',
    parameters: {
      type: 'object',
      properties: {
        actionType: {
          type: 'string',
          enum: ['create_budget', 'update_budget', 'create_transaction', 'create_bill'],
          description: 'Type of financial action proposed',
        },
        details: {
          type: 'object',
          description: 'Parameters required for the action (e.g. category, amount, title, date, provider)',
        },
        summary: {
          type: 'string',
          description: 'Human-readable summary of the proposed action for the user to confirm',
        },
      },
      required: ['actionType', 'details', 'summary'],
    },
  },
];

/**
 * Execute tool against live database with strict user ownership validation
 */
export const executeTool = async (name, args = {}, userId, conversationId = null) => {
  if (!userId) {
    throw new Error('User authentication required for tool execution');
  }

  switch (name) {
    case 'searchTransactions': {
      const { query, category, type, startDate, endDate, limit = 25, sortBy = 'date' } = args;
      let q = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order(sortBy === 'amount' ? 'amount' : 'date', { ascending: false })
        .limit(limit);

      if (type && type !== 'all') q = q.eq('type', type);
      if (category && category !== 'all') q = q.eq('category', category);
      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);
      if (query && query.trim()) {
        const term = query.trim();
        q = q.or(`title.ilike.%${term}%,notes.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error) throw new Error(`Failed to search transactions: ${error.message}`);
      return {
        count: (data || []).length,
        transactions: (data || []).map((t) => ({
          id: t.id,
          title: t.title,
          amount: Number(t.amount),
          type: t.type,
          category: t.category,
          date: t.date,
          payment_method: t.payment_method,
        })),
      };
    }

    case 'getSpendingByCategory': {
      const { startDate, endDate, month, year } = args;
      let q = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'expense');

      if (startDate) q = q.gte('date', startDate);
      if (endDate) q = q.lte('date', endDate);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      let filtered = data || [];
      if (month !== undefined && year !== undefined) {
        filtered = filtered.filter((t) => {
          if (!t.date) return false;
          const d = new Date(t.date);
          return d.getMonth() === month && d.getFullYear() === year;
        });
      }

      const categoryTotals = {};
      let totalExpense = 0;

      filtered.forEach((t) => {
        const amt = Number(t.amount) || 0;
        const cat = t.category || 'General';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
        totalExpense += amt;
      });

      const breakdown = Object.entries(categoryTotals)
        .map(([category, amount]) => ({
          category,
          amount: Math.round(amount),
          percentage: totalExpense > 0 ? Number(((amount / totalExpense) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      return {
        totalExpense: Math.round(totalExpense),
        categoriesCount: breakdown.length,
        breakdown,
      };
    }

    case 'getSpendingByMerchant': {
      const { merchant } = args;
      if (!merchant) return { error: 'Merchant name required' };

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'expense')
        .ilike('title', `%${merchant.trim()}%`)
        .order('date', { ascending: false });

      if (error) throw new Error(error.message);

      const totalSpent = (data || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return {
        merchant,
        totalTransactions: (data || []).length,
        totalSpent: Math.round(totalSpent),
        transactions: (data || []).slice(0, 10).map((t) => ({
          title: t.title,
          amount: Number(t.amount),
          date: t.date,
          category: t.category,
        })),
      };
    }

    case 'compareMonthlySpending': {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);

      return compareMonthlySpending(data || []);
    }

    case 'getIncomeHistory': {
      const limit = args.limit || 15;
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'income')
        .order('date', { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);

      const totalIncome = (data || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return {
        count: (data || []).length,
        totalIncomeSum: Math.round(totalIncome),
        records: (data || []).map((t) => ({
          title: t.title,
          amount: Number(t.amount),
          category: t.category,
          date: t.date,
        })),
      };
    }

    case 'getBankAccounts': {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw new Error(error.message);

      const accounts = (data || []).map((a) => ({
        id: a.id,
        institutionName: a.institution_name,
        accountType: a.account_type,
        maskedAccountNumber: a.masked_account_number,
        manuallyEnteredBalance: Number(a.balance) || 0,
        provider: a.provider,
        note: 'Manually recorded balance. Live auto-sync requires future account aggregator consent.',
      }));

      const totalBalance = accounts.reduce((sum, a) => sum + a.manuallyEnteredBalance, 0);

      return {
        totalAccounts: accounts.length,
        totalRecordedBalance: Math.round(totalBalance),
        accounts,
      };
    }

    case 'getUpiTransactions': {
      const { provider } = args;
      let q = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (provider && provider.toLowerCase() !== 'all') {
        if (provider.toLowerCase() === 'other') {
          q = q
            .not('payment_method', 'ilike', '%Google Pay%')
            .not('payment_method', 'ilike', '%PhonePe%')
            .not('payment_method', 'ilike', '%Paytm%');
        } else {
          q = q.ilike('payment_method', `%${provider}%`);
        }
      }

      const { data, error } = await q.limit(20);
      if (error) throw new Error(error.message);

      return {
        provider: provider || 'all',
        count: (data || []).length,
        transactions: (data || []).map((t) => ({
          title: t.title,
          amount: Number(t.amount),
          type: t.type,
          category: t.category,
          date: t.date,
          payment_method: t.payment_method,
        })),
      };
    }

    case 'getBudgets': {
      const [budgetsRes, txsRes] = await Promise.all([
        supabase.from('budgets').select('*').eq('user_id', userId),
        supabase.from('transactions').select('*').eq('user_id', userId).eq('type', 'expense'),
      ]);

      if (budgetsRes.error) throw new Error(budgetsRes.error.message);

      const budgets = budgetsRes.data || [];
      const txs = txsRes.data || [];

      // Calculate spend this month per category
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();

      const spendMap = {};
      let totalCurrentMonthSpend = 0;

      txs.forEach((t) => {
        if (!t.date) return;
        const d = new Date(t.date);
        if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
          const amt = Number(t.amount) || 0;
          const cat = t.category || 'General';
          spendMap[cat] = (spendMap[cat] || 0) + amt;
          totalCurrentMonthSpend += amt;
        }
      });

      const overall = budgets.find((b) => b.category === 'Overall');
      const categories = budgets
        .filter((b) => b.category !== 'Overall')
        .map((b) => {
          const allocated = Number(b.amount) || 0;
          const spent = spendMap[b.category] || 0;
          const remaining = allocated - spent;
          const percentUsed = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;
          return {
            id: b.id,
            category: b.category,
            allocated,
            spent: Math.round(spent),
            remaining: Math.round(remaining),
            percentUsed,
            isExceeded: spent > allocated,
          };
        });

      return {
        overallBudget: overall ? Number(overall.amount) : null,
        totalCurrentMonthSpend: Math.round(totalCurrentMonthSpend),
        categories,
      };
    }

    case 'getBills': {
      const { status } = args;
      let q = supabase
        .from('bills')
        .select('*')
        .eq('user_id', userId)
        .order('due_date', { ascending: true });

      if (status && status !== 'all') {
        q = q.eq('status', status);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const todayStr = new Date().toISOString().split('T')[0];
      const bills = (data || []).map((b) => {
        let computedStatus = b.status || 'pending';
        if (computedStatus === 'pending' && b.due_date && b.due_date < todayStr) {
          computedStatus = 'overdue';
        }
        return {
          id: b.id,
          provider: b.provider,
          billType: b.bill_type,
          amount: Number(b.amount) || 0,
          dueDate: b.due_date,
          status: computedStatus,
          isRecurring: b.billing_period && b.billing_period !== 'one-off',
        };
      });

      const pendingTotal = bills
        .filter((b) => b.status === 'pending' || b.status === 'overdue')
        .reduce((sum, b) => sum + b.amount, 0);

      return {
        totalBills: bills.length,
        pendingTotal: Math.round(pendingTotal),
        bills,
      };
    }

    case 'getDashboardSummary': {
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);

      if (error) throw new Error(error.message);

      return calculateFinancialSummary(txs || []);
    }

    case 'analyzeAffordability': {
      const { amount, itemDescription, category } = args;
      const [txsRes, billsRes, budgetsRes, bankRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', userId),
        supabase.from('bills').select('*').eq('user_id', userId),
        supabase.from('budgets').select('*').eq('user_id', userId),
        supabase.from('bank_accounts').select('*').eq('user_id', userId),
      ]);

      return analyzeAffordability({
        amount,
        itemDescription,
        category,
        transactions: txsRes.data || [],
        bills: billsRes.data || [],
        budgets: budgetsRes.data || [],
        bankAccounts: bankRes.data || [],
      });
    }

    case 'detectRecurringExpenses': {
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);

      const recurring = detectRecurringExpenses(txs || []);
      const totalMonthlyCommitment = recurring.reduce((sum, r) => sum + r.amount, 0);

      return {
        recurringCount: recurring.length,
        totalMonthlyCommitment: Math.round(totalMonthlyCommitment),
        items: recurring,
      };
    }

    case 'detectAnomalousExpenses': {
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);

      const anomalies = detectAnomalousExpenses(txs || []);
      return {
        anomaliesCount: anomalies.length,
        anomalies,
      };
    }

    case 'estimateMonthEndSpending': {
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);

      return estimateMonthEndSpending(txs || []);
    }

    case 'identifySavingsOpportunities': {
      const [txsRes, budgetsRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', userId),
        supabase.from('budgets').select('*').eq('user_id', userId),
      ]);

      return identifySavingsOpportunities(txsRes.data || [], budgetsRes.data || []);
    }

    case 'proposeAction': {
      const { actionType, details, summary } = args;
      if (!actionType || !details) {
        throw new Error('actionType and details are required to propose action');
      }

      // Save proposal in persistent store
      const proposal = await aiStore.createProposal(
        userId,
        conversationId,
        actionType,
        { ...details, summary }
      );

      return {
        status: 'pending_user_confirmation',
        proposalId: proposal.id,
        actionType,
        summary,
        details,
        message: 'Action proposed successfully. User must explicitly click confirm to execute.',
      };
    }

    default:
      throw new Error(`Unknown financial tool: ${name}`);
  }
};

