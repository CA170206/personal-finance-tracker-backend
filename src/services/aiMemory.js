import { aiStore } from './aiStore.js';
import { supabase } from '../config/supabase.js';
import {
  detectRecurringExpenses,
  detectAnomalousExpenses,
} from './financialIntelligence.js';

export const aiMemory = {
  /**
   * Retrieve all active memories and feedback for a user
   */
  async getUserContext(userId) {
    if (!userId) return { memories: [], feedback: [], summaryText: '' };

    const [memories, feedbackList] = await Promise.all([
      aiStore.getMemory(userId),
      aiStore.getFeedback(userId),
    ]);

    // Build synthesized string for LLM system prompt
    const parts = [];

    // Group memories by type
    const byType = {};
    (memories || []).forEach((m) => {
      byType[m.memory_type] = byType[m.memory_type] || [];
      byType[m.memory_type].push(m);
    });

    if (byType.financial_goal && byType.financial_goal.length > 0) {
      parts.push(
        'User Goals: ' +
          byType.financial_goal
            .map((g) => `${g.key}: ${JSON.stringify(g.value)}`)
            .join('; ')
      );
    }

    if (byType.preference && byType.preference.length > 0) {
      parts.push(
        'User Preferences: ' +
          byType.preference
            .map((p) => `${p.key}: ${JSON.stringify(p.value)}`)
            .join('; ')
      );
    }

    if (byType.spending_pattern && byType.spending_pattern.length > 0) {
      parts.push(
        'Known Spending Patterns: ' +
          byType.spending_pattern
            .map((s) => `${s.key}: ${JSON.stringify(s.value)}`)
            .join('; ')
      );
    }

    if (byType.recurring_expense && byType.recurring_expense.length > 0) {
      parts.push(
        'Recurring Subscriptions: ' +
          byType.recurring_expense
            .map((r) => `${r.key} (₹${r.value?.amount || 0})`)
            .join(', ')
      );
    }

    // Include recent feedback so the assistant avoids rejected recommendation types
    const recentFeedback = (feedbackList || []).slice(0, 10);
    const rejectedItems = recentFeedback
      .filter((f) => f.rating === 'rejected' || f.rating === 'unhelpful')
      .map((f) => f.recommendation_key || f.user_comment)
      .filter(Boolean);

    const acceptedItems = recentFeedback
      .filter((f) => f.rating === 'accepted' || f.rating === 'helpful')
      .map((f) => f.recommendation_key || f.user_comment)
      .filter(Boolean);

    if (rejectedItems.length > 0) {
      parts.push(`User previously rejected or disliked: ${rejectedItems.join(', ')}. Avoid repeating these.`);
    }

    if (acceptedItems.length > 0) {
      parts.push(`User favored recommendations: ${acceptedItems.join(', ')}. Align future suggestions with these priorities.`);
    }

    return {
      memories,
      feedback: feedbackList,
      summaryText: parts.length > 0 ? parts.join('\n') : 'No past financial memories recorded yet.',
    };
  },

  /**
   * Automatically refresh persistent memory from recent transactions
   */
  async refreshMemoryFromData(userId) {
    if (!userId) return;

    try {
      const { data: txs, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (error || !txs || txs.length === 0) return;

      // 1. Refresh recurring expenses memory
      const recurring = detectRecurringExpenses(txs);
      for (const item of recurring.slice(0, 5)) {
        await aiStore.saveMemory(
          userId,
          'recurring_expense',
          item.normalizedTitle || item.title,
          {
            amount: item.amount,
            frequency: item.frequency,
            lastDate: item.lastChargedDate,
          },
          0.9
        );
      }

      // 2. Discover top spending category pattern
      const expenses = txs.filter((t) => t.type === 'expense');
      const catTotals = {};
      let totalExp = 0;
      expenses.forEach((t) => {
        const amt = Number(t.amount) || 0;
        const cat = t.category || 'General';
        catTotals[cat] = (catTotals[cat] || 0) + amt;
        totalExp += amt;
      });

      const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
      if (topCat && totalExp > 0) {
        const topPct = Math.round((topCat[1] / totalExp) * 100);
        await aiStore.saveMemory(
          userId,
          'spending_pattern',
          'primary_expense_category',
          {
            category: topCat[0],
            sharePercentage: topPct,
            totalSpent: Math.round(topCat[1]),
          },
          0.95
        );
      }
    } catch (err) {
      console.warn('[AI Memory] Refresh error:', err.message);
    }
  },

  /**
   * Save a user-stated goal or preference
   */
  async recordUserGoal(userId, key, value) {
    return aiStore.saveMemory(userId, 'financial_goal', key, value, 1.0);
  },

  async recordUserPreference(userId, key, value) {
    return aiStore.saveMemory(userId, 'preference', key, value, 1.0);
  },
};

export default aiMemory;

