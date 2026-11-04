import { aiStore } from '../services/aiStore.js';
import { processAIChat } from '../services/aiProvider.js';
import { aiMemory } from '../services/aiMemory.js';
import { aiAlerts } from '../services/aiAlerts.js';
import { supabase } from '../config/supabase.js';

// @desc    Process a user message and return intelligent AI response
// @route   POST /api/ai/chat
// @access  Private
export const sendChatMessage = async (req, res, next) => {
  const reqStart = Date.now();
  try {
    const userId = req.user.id;
    const userName = req.user.name || req.user.email || 'User';
    let { conversationId, message } = req.body;

    console.log(`[AI Pipeline] 📨 Request received from user "${userName}" (${userId.slice(0, 8)}...)`);
    console.log(`[AI Pipeline] 💬 Message: "${message ? message.slice(0, 70) : ''}..."`);

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required',
      });
    }

    // 1. Conversation loading / creation
    let conv;
    if (!conversationId) {
      const firstLine = message.trim().slice(0, 40);
      conv = await aiStore.createConversation(
        userId,
        firstLine.length > 0 ? firstLine : 'Financial Discussion'
      );
      conversationId = conv.id;
      console.log(`[AI Pipeline] 🆕 Created conversation: ${conversationId}`);
    } else {
      conv = await aiStore.getConversation(userId, conversationId);
      if (!conv) {
        console.warn(`[AI Pipeline] ⚠️ Conversation not found: ${conversationId}`);
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or access denied',
        });
      }
      console.log(`[AI Pipeline] 📂 Loaded existing conversation: ${conversationId}`);
    }

    // 2. Save user message to persistent history
    await aiStore.saveMessage(userId, conversationId, 'user', message.trim());
    console.log(`[AI Pipeline] 💾 User turn persisted`);

    // 3. Process chat with AI provider & tool calling orchestrator
    const aiResult = await processAIChat({
      user: req.user,
      conversationId,
      message: message.trim(),
    });

    const toolsExecuted = aiResult.toolCalls?.map((t) => t.tool) || [];
    console.log(`[AI Pipeline] 🛠️ Tools executed (${toolsExecuted.length}): ${toolsExecuted.join(', ') || 'None'}`);
    console.log(`[AI Pipeline] 💡 Insights generated: ${aiResult.insights?.map((i) => i.type).join(', ') || 'None'}`);

    // 4. Save assistant response to persistent history
    const savedAssistantMsg = await aiStore.saveMessage(
      userId,
      conversationId,
      'assistant',
      aiResult.content,
      aiResult.toolCalls || [],
      aiResult.insights || [],
      aiResult.proposals || []
    );
    console.log(`[AI Pipeline] 💾 Assistant turn persisted`);

    const elapsed = Date.now() - reqStart;
    console.log(`[AI Pipeline] ✅ Final response generated successfully in ${elapsed}ms`);

    return res.status(200).json({
      success: true,
      conversationId,
      message: savedAssistantMsg,
      insights: aiResult.insights || [],
      proposals: aiResult.proposals || [],
      suggestedQuestions: aiResult.suggestedQuestions || [],
    });
  } catch (error) {
    const elapsed = Date.now() - reqStart;
    console.error(`[AI Pipeline] ❌ Error in chat pipeline after ${elapsed}ms:`, error.message);
    if (error.stack && process.env.NODE_ENV !== 'production') {
      console.error(error.stack);
    }
    return res.status(500).json({
      success: false,
      message: `Failed to process financial query: ${error.message || 'Pipeline processing error'}`,
      code: 'AI_PROCESSING_ERROR',
    });
  }
};

// @desc    Get all conversations for user
// @route   GET /api/ai/conversations
// @access  Private
export const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const conversations = await aiStore.getConversations(userId);
    return res.status(200).json({
      success: true,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new conversation session
// @route   POST /api/ai/conversations
// @access  Private
export const createConversation = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title } = req.body;
    const conv = await aiStore.createConversation(userId, title || 'New Financial Chat');
    return res.status(201).json({
      success: true,
      data: conv,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get messages for a conversation
// @route   GET /api/ai/conversations/:id
// @access  Private
export const getConversationHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const conv = await aiStore.getConversation(userId, id);
    if (!conv) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    const messages = await aiStore.getMessages(userId, id);
    return res.status(200).json({
      success: true,
      conversation: conv,
      messages,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a conversation
// @route   DELETE /api/ai/conversations/:id
// @access  Private
export const deleteConversation = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const conv = await aiStore.getConversation(userId, id);
    if (!conv) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    await aiStore.deleteConversation(userId, id);
    return res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dynamic suggested questions based on real user data
// @route   GET /api/ai/suggestions
// @access  Private
export const getSuggestions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch brief user context
    const [txsRes, billsRes, budgetsRes] = await Promise.all([
      supabase.from('transactions').select('category, amount, type').eq('user_id', userId).limit(20),
      supabase.from('bills').select('id, status').eq('user_id', userId).eq('status', 'pending').limit(5),
      supabase.from('budgets').select('category').eq('user_id', userId).limit(5),
    ]);

    const txs = txsRes.data || [];
    const pendingBills = billsRes.data || [];
    const budgets = budgetsRes.data || [];

    const suggestions = [];

    if (txs.length > 0) {
      suggestions.push('Compare this month with last month');
      suggestions.push('Can I afford a ₹15,000 purchase?');
      suggestions.push('What are my recurring subscriptions?');
      suggestions.push('Estimate my month-end savings');
    } else {
      suggestions.push('How does FinTrack AI manage my finances?');
      suggestions.push('What is the best way to start budgeting?');
      suggestions.push('Can I afford a planned purchase?');
    }

    if (pendingBills.length > 0) {
      suggestions.unshift('Which bills are due next week?');
    }

    if (budgets.length > 0) {
      suggestions.push('Are any of my budgets close to the limit?');
    }

    return res.status(200).json({
      success: true,
      data: suggestions.slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's persistent adaptive memory
// @route   GET /api/ai/memory
// @access  Private
export const getUserMemory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const memory = await aiMemory.getUserContext(userId);
    return res.status(200).json({
      success: true,
      data: memory,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Save user feedback on a recommendation or answer
// @route   POST /api/ai/feedback
// @access  Private
export const submitFeedback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { messageId, rating, recommendationKey, userComment } = req.body;

    if (!rating || !['helpful', 'unhelpful', 'accepted', 'rejected'].includes(rating)) {
      return res.status(400).json({
        success: false,
        message: 'Valid rating is required: helpful, unhelpful, accepted, or rejected',
      });
    }

    const feedbackEntry = await aiStore.saveFeedback(
      userId,
      messageId,
      rating,
      recommendationKey,
      userComment
    );

    return res.status(201).json({
      success: true,
      message: 'Feedback recorded. Future recommendations will adapt to your preferences.',
      data: feedbackEntry,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Confirm and execute an action proposal (Security Guardrail)
// @route   POST /api/ai/proposals/:id/execute
// @access  Private
export const executeActionProposal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const proposal = await aiStore.getProposal(userId, id);
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: 'Action proposal not found or does not belong to you',
      });
    }

    if (proposal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Proposal has already been ${proposal.status}`,
      });
    }

    if (new Date(proposal.expires_at) < new Date()) {
      await aiStore.updateProposalStatus(userId, id, 'expired');
      return res.status(400).json({
        success: false,
        message: 'Action proposal has expired. Please ask the AI to re-create it.',
      });
    }

    const { action_type, details } = proposal;
    let executionResult = null;

    // Mutate the actual database record based on action type
    switch (action_type) {
      case 'create_budget': {
        const { category, allocated, name } = details;
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear = now.getFullYear();
        const budgetName = name || `${category.trim()} Budget`;
        const numAllocated = Number(allocated);

        // Check if category budget already exists for this user
        const { data: existing } = await supabase
          .from('budgets')
          .select('id')
          .eq('user_id', userId)
          .eq('category', category.trim())
          .maybeSingle();

        let budgetData;
        if (existing) {
          const { data, error } = await supabase
            .from('budgets')
            .update({
              name: budgetName,
              amount: numAllocated,
              month: curMonth,
              year: curYear,
              updated_at: now.toISOString(),
            })
            .eq('id', existing.id)
            .eq('user_id', userId)
            .select()
            .single();

          if (error) throw new Error(error.message);
          budgetData = data;
        } else {
          const { data, error } = await supabase
            .from('budgets')
            .insert([
              {
                user_id: userId,
                name: budgetName,
                category: category.trim(),
                amount: numAllocated,
                month: curMonth,
                year: curYear,
              },
            ])
            .select()
            .single();

          if (error) throw new Error(error.message);
          budgetData = data;
        }

        executionResult = { action: 'budget_created', data: budgetData };
        break;
      }

      case 'create_transaction': {
        const { title, amount, type, category, date, notes } = details;
        const { data, error } = await supabase
          .from('transactions')
          .insert([
            {
              user_id: userId,
              title: title.trim(),
              amount: Number(amount),
              type: type || 'expense',
              category: (category || 'General').trim(),
              date: date || new Date().toISOString().split('T')[0],
              notes: notes ? notes.trim() : 'Created via FinTrack AI',
              source: 'ai_assistant',
            },
          ])
          .select()
          .single();

        if (error) throw new Error(error.message);
        executionResult = { action: 'transaction_created', data };
        break;
      }

      case 'create_bill': {
        const { provider, billType, amount, dueDate, billingPeriod } = details;
        const { data, error } = await supabase
          .from('bills')
          .insert([
            {
              user_id: userId,
              provider: provider.trim(),
              bill_type: billType || 'Other',
              amount: Number(amount),
              due_date: dueDate || new Date().toISOString().split('T')[0],
              billing_period: billingPeriod || 'monthly',
              status: 'pending',
              source: 'ai_assistant',
            },
          ])
          .select()
          .single();

        if (error) throw new Error(error.message);
        executionResult = { action: 'bill_created', data };
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          message: `Unsupported action type: ${action_type}`,
        });
    }

    // Mark proposal confirmed and executed
    await aiStore.updateProposalStatus(userId, id, 'confirmed');

    return res.status(200).json({
      success: true,
      message: 'Action successfully confirmed and executed in database!',
      result: executionResult,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject / Cancel an action proposal
// @route   POST /api/ai/proposals/:id/reject
// @access  Private
export const rejectActionProposal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const proposal = await aiStore.getProposal(userId, id);
    if (!proposal) {
      return res.status(404).json({
        success: false,
        message: 'Action proposal not found',
      });
    }

    await aiStore.updateProposalStatus(userId, id, 'rejected');
    return res.status(200).json({
      success: true,
      message: 'Action proposal rejected and cancelled.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Scan and generate proactive alerts
// @route   POST /api/ai/alerts/scan
// @access  Private
export const scanProactiveAlerts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const alerts = await aiAlerts.generateProactiveAlerts(userId);
    return res.status(200).json({
      success: true,
      generatedCount: alerts.length,
      alerts,
    });
  } catch (error) {
    next(error);
  }
};

