import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  generateReminders,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getNotifications);
router.route('/unread-count').get(getUnreadCount);
router.route('/read-all').patch(markAllNotificationsRead);
router.route('/generate-reminders').post(generateReminders);

router
  .route('/:id')
  .delete(deleteNotification);

router.route('/:id/read').patch(markNotificationRead);

export default router;

