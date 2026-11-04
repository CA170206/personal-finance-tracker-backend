import { supabase } from '../config/supabase.js';
import {
  estimateMonthEndSpending,
  detectAnomalousExpenses,
} from './financialIntelligence.js';

export const aiAlerts = {
  /**
   * Scan user's financial landscape and generate proactive alerts
   * Strictly deduplicates alerts within a 24-hour window
   */
  async generateProactiveAlerts(userId) {
    if (!userId) return [];

    try {
      // 1. Fetch relevant user datasets in parallel
      const [txsRes, budgetsRes, billsRes, existingNotifsRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', userId),
        supabase.from('budgets').select('*').eq('user_id', userId),
        supabase.from('bills').select('*').eq('user_id', userId),
        supabase
          .from('notifications')
          .select('title, created_at')
          .eq('user_id', userId)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const txs = txsRes.data || [];
      const budgets = budgetsRes.data || [];
      const bills = billsRes.data || [];
      const existingTitles = new Set(
        (existingNotifsRes.data || []).map((n) => n.title.toLowerCase().trim())
      );

      const generatedAlerts = [];
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();

      // Check Category Budgets
      const catSpends = {};
      let totalCurIncome = 0;
      let totalCurExpense = 0;

      txs.forEach((t) => {
        const amt = Number(t.amount) || 0;
        if (t.date) {
          const d = new Date(t.date);
          if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
            if (t.type === 'income') totalCurIncome += amt;
            if (t.type === 'expense') {
              totalCurExpense += amt;
              const c = t.category || 'General';
              catSpends[c] = (catSpends[c] || 0) + amt;
            }
          }
        }
      });

      budgets.forEach((b) => {
        if (b.category === 'Overall') return;
        const allocated = Number(b.amount) || 0;
        const spent = catSpends[b.category] || 0;

        if (allocated > 0 && spent > allocated) {
          const title = `Budget Alert: ${b.category} Exceeded`;
          if (!existingTitles.has(title.toLowerCase())) {
            generatedAlerts.push({
              user_id: userId,
              title,
              message: `Your spending in ${b.category} (₹${spent.toLocaleString('en-IN')}) has exceeded your monthly limit of ₹${allocated.toLocaleString('en-IN')}.`,
              type: 'ai_alert',
              is_read: false,
              created_at: new Date().toISOString(),
            });
            existingTitles.add(title.toLowerCase());
          }
        }
      });

      // Check Liquidity against Upcoming Bills
      const upcomingBills = bills.filter((b) => b.status === 'pending' || b.status === 'overdue');
      const upcomingSum = upcomingBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const netLedger = totalCurIncome - totalCurExpense;

      if (upcomingSum > 0 && upcomingSum > netLedger) {
        const title = 'Liquidity Warning: Upcoming Bills Exceed Cash Flow';
        if (!existingTitles.has(title.toLowerCase())) {
          generatedAlerts.push({
            user_id: userId,
            title,
            message: `You have ₹${upcomingSum.toLocaleString('en-IN')} in pending bills due soon, exceeding your current monthly net cash flow (₹${netLedger.toLocaleString('en-IN')}).`,
            type: 'ai_alert',
            is_read: false,
            created_at: new Date().toISOString(),
          });
          existingTitles.add(title.toLowerCase());
        }
      }

      // Check Month-End Burn Rate Deficit
      const projection = estimateMonthEndSpending(txs);
      if (projection.burnRateWarning) {
        const title = 'Month-End Deficit Warning';
        if (!existingTitles.has(title.toLowerCase())) {
          generatedAlerts.push({
            user_id: userId,
            title,
            message: `At your current daily burn rate of ₹${projection.dailyBurnRate.toLocaleString('en-IN')}/day, projected spending (₹${projection.projectedTotalExpense.toLocaleString('en-IN')}) will exceed monthly income.`,
            type: 'ai_alert',
            is_read: false,
            created_at: new Date().toISOString(),
          });
          existingTitles.add(title.toLowerCase());
        }
      }

      // Check Anomalous Spikes
      const anomalies = detectAnomalousExpenses(txs);
      if (anomalies.length > 0) {
        const topAnomaly = anomalies[0];
        const title = `Unusual Expense Detected: ${topAnomaly.title}`;
        if (!existingTitles.has(title.toLowerCase())) {
          generatedAlerts.push({
            user_id: userId,
            title,
            message: `Expense of ₹${topAnomaly.amount.toLocaleString('en-IN')} on ${topAnomaly.title} is ${topAnomaly.deviationFactor}x your average spend in ${topAnomaly.category}.`,
            type: 'ai_alert',
            is_read: false,
            created_at: new Date().toISOString(),
          });
          existingTitles.add(title.toLowerCase());
        }
      }

      // Batch insert into notifications table if any
      if (generatedAlerts.length > 0) {
        await supabase.from('notifications').insert(generatedAlerts);
      }

      return generatedAlerts;
    } catch (err) {
      console.warn('[AI Alerts] Failed to generate proactive alerts:', err.message);
      return [];
    }
  },
};

export default aiAlerts;

