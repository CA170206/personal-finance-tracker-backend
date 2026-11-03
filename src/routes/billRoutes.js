import express from 'express';
import {
  getBills,
  getBillsSummary,
  getBillById,
  createBill,
  updateBill,
  markBillPaid,
  deleteBill,
} from '../controllers/billController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getBills).post(createBill);
router.route('/summary').get(getBillsSummary);

router
  .route('/:id')
  .get(getBillById)
  .put(updateBill)
  .delete(deleteBill);

router.route('/:id/pay').patch(markBillPaid);

export default router;

