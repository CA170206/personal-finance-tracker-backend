import { supabase } from '../config/supabase.js';

/**
 * Helper to sync smart reminders from user's bills and budgets
 */
const syncBillReminders = async (userId) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Fetch pending or overdue bills
    const { data: bills } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'paid');

    if (!bills || bills.length === 0) return;

    // Fetch existing notification bill associations for this user
    const { data: existingNotifs } = await supabase
      .from('notifications')
      .select('related_bill_id, type')
      .eq('user_id', userId);

    const existingKeys = new Set(
      (existingNotifs || []).map((n) => `${n.related_bill_id}_${n.type}`)
    );

    const newNotifs = [];

    for (const bill of bills) {
      if (!bill.due_date) continue;
      const dueDate = new Date(bill.due_date);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (bill.due_date < todayStr) {
        // Overdue bill alert
        const key = `${bill.id}_overdue_bill`;
        if (!existingKeys.has(key)) {
          newNotifs.push({
            user_id: userId,
            title: `Overdue: ${bill.provider} Bill`,
            message: `Your ${bill.bill_type} bill of ₹${bill.amount} was due on ${bill.due_date}. Please pay to avoid penalties.`,
            type: 'overdue_bill',
            related_bill_id: bill.id,
            is_read: false,
          });
          existingKeys.add(key);
        }
      } else if (diffDays >= 0 && diffDays <= 5) {
        // Upcoming bill reminder
        const key = `${bill.id}_bill_reminder`;
        if (!existingKeys.has(key)) {
          const daysText = diffDays === 0 ? 'today' : `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
          newNotifs.push({
            user_id: userId,
            title: `Upcoming: ${bill.provider} Bill`,
            message: `Your ${bill.bill_type} bill of ₹${bill.amount} is due ${daysText} (${bill.due_date}).`,
            type: 'bill_reminder',
            related_bill_id: bill.id,
            is_read: false,
          });
          existingKeys.add(key);
        }
      }
    }

    if (newNotifs.length > 0) {
      await supabase.from('notifications').insert(newNotifs);
    }
  } catch (err) {
    console.error('[Notification Engine] syncBillReminders error:', err.message);
  }
};

// @desc    Get all notifications for user
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Trigger proactive reminder synchronization
    await syncBillReminders(userId);

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Notifications] Fetch error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve notifications',
      });
    }

    const unreadCount = (notifications || []).filter((n) => !n.is_read).length;

    return res.status(200).json({
      success: true,
      data: notifications || [],
      unread_count: unreadCount,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get count of unread notifications
// @route   GET /api/notifications/unread-count
// @access  Private
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return res.status(500).json({ success: false, message: 'Failed to count unread notifications' });
    }

    return res.status(200).json({
      success: true,
      unread_count: count || 0,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markNotificationRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: updated, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !updated) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notifications as read',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Generate reminders proactively
// @route   POST /api/notifications/generate-reminders
// @access  Private
export const generateReminders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    await syncBillReminders(userId);

    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return res.status(200).json({
      success: true,
      message: 'Reminders evaluated successfully',
      data: notifications || [],
    });
  } catch (err) {
    next(err);
  }
};

export default {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  generateReminders,
};

