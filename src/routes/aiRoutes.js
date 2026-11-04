import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  sendChatMessage,
  getConversations,
  createConversation,
  getConversationHistory,
  deleteConversation,
  getSuggestions,
  getUserMemory,
  submitFeedback,
  executeActionProposal,
  rejectActionProposal,
  scanProactiveAlerts,
} from '../controllers/aiController.js';

const router = express.Router();

// All AI endpoints require authenticated JWT session
router.use(protect);

// Chat & Conversations
router.post('/chat', sendChatMessage);
router.get('/conversations', getConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:id', getConversationHistory);
router.delete('/conversations/:id', deleteConversation);

// Smart Suggestions & Adaptive Memory
router.get('/suggestions', getSuggestions);
router.get('/memory', getUserMemory);
router.post('/feedback', submitFeedback);

// Security Guardrail: Action Proposals & Explicit Confirmations
router.post('/proposals/:id/execute', executeActionProposal);
router.post('/proposals/:id/reject', rejectActionProposal);

// Proactive Alerts Scanner
router.post('/alerts/scan', scanProactiveAlerts);

export default router;

