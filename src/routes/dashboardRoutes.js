import express from 'express';
import { getSummary, getCharts } from '../controllers/dashboardController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // All dashboard routes require JWT authentication

router.get('/summary', getSummary);
router.get('/charts', getCharts);

export default router;

