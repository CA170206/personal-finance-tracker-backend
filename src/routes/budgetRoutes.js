import express from 'express';
import {
  getBudgets,
  getBudgetById,
  createBudget,
  updateBudget,
  deleteBudget,
  getOverallBudget,
  setOverallBudget,
  updateOverallBudget,
} from '../controllers/budgetController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // All budget routes require JWT authentication

router.route('/overall')
  .get(getOverallBudget)
  .post(setOverallBudget)
  .put(setOverallBudget);

router.route('/')
  .get(getBudgets)
  .post(createBudget);

router.route('/:id')
  .get(getBudgetById)
  .put(updateBudget)
  .delete(deleteBudget);

export default router;

