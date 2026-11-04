-- FinTrack AI: Adaptive Personal Financial Intelligence Database Schema
-- Migration: 20261104_create_ai_tables.sql

-- 1. AI Conversations
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Financial Discussion',
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at ON public.ai_conversations(updated_at DESC);

-- 2. AI Messages
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tool_calls JSONB DEFAULT '[]'::jsonb,
    insights JSONB DEFAULT '[]'::jsonb,
    proposals JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_convo ON public.ai_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user_id ON public.ai_messages(user_id);

-- 3. AI Adaptive Financial Memory
CREATE TABLE IF NOT EXISTS public.ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    memory_type VARCHAR(50) NOT NULL, -- 'spending_pattern', 'income_pattern', 'financial_goal', 'preference', 'recurring_expense', 'summary'
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    confidence NUMERIC(3, 2) DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_memory_key UNIQUE(user_id, memory_type, key)
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_user_type ON public.ai_memory(user_id, memory_type);

-- 4. AI Feedback & Personalization
CREATE TABLE IF NOT EXISTS public.ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.ai_messages(id) ON DELETE SET NULL,
    rating VARCHAR(20) NOT NULL CHECK (rating IN ('helpful', 'unhelpful', 'accepted', 'rejected')),
    recommendation_key VARCHAR(100),
    user_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_user_id ON public.ai_feedback(user_id);

-- 5. AI Action Proposals (User confirmation guardrail)
CREATE TABLE IF NOT EXISTS public.ai_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL, -- 'create_budget', 'update_budget', 'create_transaction', 'create_bill'
    details JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_proposals_user_status ON public.ai_proposals(user_id, status);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_proposals ENABLE ROW LEVEL SECURITY;

