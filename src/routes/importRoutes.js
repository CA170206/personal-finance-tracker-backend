import express from 'express';
import {
  previewImport,
  executeImport,
  getImportHistory,
} from '../controllers/importController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.post('/preview', previewImport);
router.post('/transactions', executeImport);
router.post('/csv', executeImport);
router.get('/history', getImportHistory);

export default router;

