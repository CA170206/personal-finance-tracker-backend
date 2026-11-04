import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { supabase } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'ai_store.json');

// Ensure local persistence directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory cache synced with disk for fallback
let fallbackStore = {
  conversations: [],
  messages: [],
  memory: [],
  feedback: [],
  proposals: [],
};

const loadFallback = () => {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      fallbackStore = JSON.parse(raw);
    } else {
      saveFallback();
    }
  } catch (err) {
    console.warn('[AI Store] Failed to load local store, initializing fresh:', err.message);
  }
};

const saveFallback = () => {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(fallbackStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('[AI Store] Failed to write local store:', err.message);
  }
};

loadFallback();

// Helper to check if Supabase error is a missing table error
const isMissingTableError = (err) => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('could not find the table') ||
    msg.includes('relation') ||
    msg.includes('schema cache') ||
    err.code === 'PGRST204' ||
    err.code === 'PGRST205' ||
    err.code === '42P01'
  );
};

// Cached table availability flag: null = unverified, true = Supabase tables present, false = fallback active
let supabaseAiTablesSupported = null;

export const verifyAiTables = async () => {
  try {
    const { error } = await supabase.from('ai_conversations').select('id').limit(1);
    if (error && isMissingTableError(error)) {
      supabaseAiTablesSupported = false;
      console.log('ℹ️ [AI Store] Supabase AI tables (ai_conversations, etc.) not detected in schema cache (PGRST205). Dual-layer storage active.');
    } else if (!error) {
      supabaseAiTablesSupported = true;
      console.log('✅ [AI Store] Supabase AI tables verified and active in PostgreSQL!');
    } else {
      supabaseAiTablesSupported = false;
    }
  } catch {
    supabaseAiTablesSupported = false;
  }
  return supabaseAiTablesSupported;
};

// Initial verification on startup
verifyAiTables();

export const aiStore = {
  async refreshTableStatus() {
    supabaseAiTablesSupported = null;
    return verifyAiTables();
  },

  isSupabaseConnected() {
    return supabaseAiTablesSupported === true;
  },

  // ================= CONVERSATIONS =================
  async getConversations(userId) {
    if (supabaseAiTablesSupported === false) {
      return fallbackStore.conversations
        .filter((c) => c.user_id === userId)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }

    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          return fallbackStore.conversations
            .filter((c) => c.user_id === userId)
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        }
        throw error;
      }
      return data || [];
    } catch {
      return fallbackStore.conversations
        .filter((c) => c.user_id === userId)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
  },

  async getConversation(userId, conversationId) {
    if (supabaseAiTablesSupported === false) {
      return (
        fallbackStore.conversations.find(
          (c) => c.id === conversationId && c.user_id === userId
        ) || null
      );
    }

    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          return (
            fallbackStore.conversations.find(
              (c) => c.id === conversationId && c.user_id === userId
            ) || null
          );
        }
        throw error;
      }
      return data;
    } catch {
      return (
        fallbackStore.conversations.find(
          (c) => c.id === conversationId && c.user_id === userId
        ) || null
      );
    }
  },

  async createConversation(userId, title = 'New Financial Chat') {
    const now = new Date().toISOString();
    const newConv = {
      id: randomUUID(),
      user_id: userId,
      title: title.slice(0, 80),
      created_at: now,
      updated_at: now,
    };

    if (supabaseAiTablesSupported === false) {
      fallbackStore.conversations.unshift(newConv);
      saveFallback();
      return newConv;
    }

    try {
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert([newConv])
        .select()
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          fallbackStore.conversations.unshift(newConv);
          saveFallback();
          return newConv;
        }
        throw error;
      }
      return data;
    } catch {
      fallbackStore.conversations.unshift(newConv);
      saveFallback();
      return newConv;
    }
  },

  async deleteConversation(userId, conversationId) {
    if (supabaseAiTablesSupported !== false) {
      try {
        const { error } = await supabase
          .from('ai_conversations')
          .delete()
          .eq('id', conversationId)
          .eq('user_id', userId);

        if (error && isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
        }
      } catch {
        // Fallback deletion
      }
    }

    // Always clear from fallback store
    fallbackStore.conversations = fallbackStore.conversations.filter(
      (c) => !(c.id === conversationId && c.user_id === userId)
    );
    fallbackStore.messages = fallbackStore.messages.filter(
      (m) => !(m.conversation_id === conversationId && m.user_id === userId)
    );
    fallbackStore.proposals = fallbackStore.proposals.filter(
      (p) => !(p.conversation_id === conversationId && p.user_id === userId)
    );
    saveFallback();
    return true;
  },

  async updateConversationTitle(userId, conversationId, title) {
    const now = new Date().toISOString();
    if (supabaseAiTablesSupported !== false) {
      try {
        const { data, error } = await supabase
          .from('ai_conversations')
          .update({ title, updated_at: now })
          .eq('id', conversationId)
          .eq('user_id', userId)
          .select()
          .single();

        if (error && isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
        } else if (data) {
          return data;
        }
      } catch {
        // ignore
      }
    }

    const conv = fallbackStore.conversations.find(
      (c) => c.id === conversationId && c.user_id === userId
    );
    if (conv) {
      conv.title = title;
      conv.updated_at = now;
      saveFallback();
      return conv;
    }
    return null;
  },

  // ================= MESSAGES =================
  async getMessages(userId, conversationId) {
    if (supabaseAiTablesSupported === false) {
      return fallbackStore.messages
        .filter((m) => m.conversation_id === conversationId && m.user_id === userId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          return fallbackStore.messages
            .filter((m) => m.conversation_id === conversationId && m.user_id === userId)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
        throw error;
      }
      return data || [];
    } catch {
      return fallbackStore.messages
        .filter((m) => m.conversation_id === conversationId && m.user_id === userId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
  },

  async saveMessage(userId, conversationId, role, content, toolCalls = [], insights = [], proposals = []) {
    const newMsg = {
      id: randomUUID(),
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      tool_calls: toolCalls,
      insights,
      proposals,
      created_at: new Date().toISOString(),
    };

    const now = new Date().toISOString();

    if (supabaseAiTablesSupported === false) {
      fallbackStore.messages.push(newMsg);
      const c = fallbackStore.conversations.find((x) => x.id === conversationId);
      if (c) c.updated_at = now;
      saveFallback();
      return newMsg;
    }

    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .insert([newMsg])
        .select()
        .single();

      // Touch conversation updated_at
      await supabase
        .from('ai_conversations')
        .update({ updated_at: now })
        .eq('id', conversationId)
        .eq('user_id', userId);

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          fallbackStore.messages.push(newMsg);
          const c = fallbackStore.conversations.find((x) => x.id === conversationId);
          if (c) c.updated_at = now;
          saveFallback();
          return newMsg;
        }
        throw error;
      }
      return data;
    } catch {
      fallbackStore.messages.push(newMsg);
      const c = fallbackStore.conversations.find((x) => x.id === conversationId);
      if (c) c.updated_at = now;
      saveFallback();
      return newMsg;
    }
  },

  // ================= ADAPTIVE MEMORY =================
  async getMemory(userId, memoryType = null) {
    if (supabaseAiTablesSupported === false) {
      return fallbackStore.memory
        .filter((m) => m.user_id === userId && (!memoryType || m.memory_type === memoryType))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }

    try {
      let query = supabase.from('ai_memory').select('*').eq('user_id', userId);
      if (memoryType) {
        query = query.eq('memory_type', memoryType);
      }
      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          return fallbackStore.memory
            .filter((m) => m.user_id === userId && (!memoryType || m.memory_type === memoryType))
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        }
        throw error;
      }
      return data || [];
    } catch {
      return fallbackStore.memory
        .filter((m) => m.user_id === userId && (!memoryType || m.memory_type === memoryType))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
  },

  async saveMemory(userId, memoryType, key, value, confidence = 1.0) {
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      user_id: userId,
      memory_type: memoryType,
      key,
      value,
      confidence,
      created_at: now,
      updated_at: now,
    };

    const updateFallback = () => {
      const idx = fallbackStore.memory.findIndex(
        (m) => m.user_id === userId && m.memory_type === memoryType && m.key === key
      );
      if (idx >= 0) {
        fallbackStore.memory[idx] = {
          ...fallbackStore.memory[idx],
          value,
          confidence,
          updated_at: now,
        };
      } else {
        fallbackStore.memory.push(record);
      }
      saveFallback();
      return record;
    };

    if (supabaseAiTablesSupported === false) {
      return updateFallback();
    }

    try {
      const { data, error } = await supabase
        .from('ai_memory')
        .upsert(
          [
            {
              user_id: userId,
              memory_type: memoryType,
              key,
              value,
              confidence,
              updated_at: now,
            },
          ],
          { onConflict: 'user_id,memory_type,key' }
        )
        .select()
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          return updateFallback();
        }
        throw error;
      }
      return data;
    } catch {
      return updateFallback();
    }
  },

  // ================= FEEDBACK =================
  async saveFeedback(userId, messageId, rating, recommendationKey = null, userComment = '') {
    const now = new Date().toISOString();
    const entry = {
      id: randomUUID(),
      user_id: userId,
      message_id: messageId || null,
      rating,
      recommendation_key: recommendationKey || null,
      user_comment: userComment ? userComment.trim() : '',
      created_at: now,
    };

    if (supabaseAiTablesSupported === false) {
      fallbackStore.feedback.push(entry);
      saveFallback();
      return entry;
    }

    try {
      const { data, error } = await supabase
        .from('ai_feedback')
        .insert([entry])
        .select()
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          fallbackStore.feedback.push(entry);
          saveFallback();
          return entry;
        }
        throw error;
      }
      return data;
    } catch {
      fallbackStore.feedback.push(entry);
      saveFallback();
      return entry;
    }
  },

  async getFeedback(userId) {
    if (supabaseAiTablesSupported === false) {
      return fallbackStore.feedback
        .filter((f) => f.user_id === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    try {
      const { data, error } = await supabase
        .from('ai_feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          return fallbackStore.feedback
            .filter((f) => f.user_id === userId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }
        throw error;
      }
      return data || [];
    } catch {
      return fallbackStore.feedback
        .filter((f) => f.user_id === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  },

  // ================= ACTION PROPOSALS =================
  async createProposal(userId, conversationId, actionType, details, expiresInMinutes = 30) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();
    const proposal = {
      id: randomUUID(),
      user_id: userId,
      conversation_id: conversationId,
      action_type: actionType,
      details,
      status: 'pending',
      expires_at: expiresAt,
      created_at: now.toISOString(),
      executed_at: null,
    };

    if (supabaseAiTablesSupported === false) {
      fallbackStore.proposals.push(proposal);
      saveFallback();
      return proposal;
    }

    try {
      const { data, error } = await supabase
        .from('ai_proposals')
        .insert([proposal])
        .select()
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          fallbackStore.proposals.push(proposal);
          saveFallback();
          return proposal;
        }
        throw error;
      }
      return data;
    } catch {
      fallbackStore.proposals.push(proposal);
      saveFallback();
      return proposal;
    }
  },

  async getProposal(userId, proposalId) {
    if (supabaseAiTablesSupported === false) {
      return (
        fallbackStore.proposals.find(
          (p) => p.id === proposalId && p.user_id === userId
        ) || null
      );
    }

    try {
      const { data, error } = await supabase
        .from('ai_proposals')
        .select('*')
        .eq('id', proposalId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
          return (
            fallbackStore.proposals.find(
              (p) => p.id === proposalId && p.user_id === userId
            ) || null
          );
        }
        throw error;
      }
      return data;
    } catch {
      return (
        fallbackStore.proposals.find(
          (p) => p.id === proposalId && p.user_id === userId
        ) || null
      );
    }
  },

  async updateProposalStatus(userId, proposalId, status) {
    const now = new Date().toISOString();
    const updatePayload = {
      status,
      ...(status === 'confirmed' ? { executed_at: now } : {}),
    };

    if (supabaseAiTablesSupported !== false) {
      try {
        const { data, error } = await supabase
          .from('ai_proposals')
          .update(updatePayload)
          .eq('id', proposalId)
          .eq('user_id', userId)
          .select()
          .single();

        if (error && isMissingTableError(error)) {
          supabaseAiTablesSupported = false;
        } else if (data) {
          return data;
        }
      } catch {
        // ignore
      }
    }

    const p = fallbackStore.proposals.find(
      (x) => x.id === proposalId && x.user_id === userId
    );
    if (p) {
      p.status = status;
      if (status === 'confirmed') p.executed_at = now;
      saveFallback();
      return p;
    }
    return null;
  },
};

export default aiStore;
