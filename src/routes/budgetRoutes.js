import express from 'express';
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getOverallBudget,
  updateOverallBudget,
} from '../controllers/budgetController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // All budget routes require JWT authentication

router.route('/overall')
  .get(getOverallBudget)
  .put(updateOverallBudget);

router.route('/')
  .get(getBudgets)
  .post(createBudget);

router.route('/:id')
  .put(updateBudget)
  .delete(deleteBudget);

export default router;

