import express from 'express';
import {
  getBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getBankAccountTransactions,
} from '../controllers/bankAccountController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getBankAccounts).post(createBankAccount);

router
  .route('/:id')
  .get(getBankAccountById)
  .put(updateBankAccount)
  .delete(deleteBankAccount);

router.route('/:id/transactions').get(getBankAccountTransactions);

export default router;

