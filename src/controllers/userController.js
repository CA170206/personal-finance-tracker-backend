import { supabase } from '../config/supabase.js';

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = async (req, res) => {
  return res.status(200).json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    currency: req.user.currency || 'INR',
    currencySymbol: req.user.currencySymbol || '₹',
    role: req.user.role || 'Pro Member',
    theme: req.user.theme || 'dark',
    joinedDate: req.user.joinedDate || req.user.created_at,
  });
};

// @desc    Update user profile details
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, currency, theme } = req.body;

    const updates = {};
    if (name) updates.name = name.trim();
    if (currency) updates.currency = currency;
    if (theme && ['dark', 'light'].includes(theme)) updates.theme = theme;
    updates.updated_at = new Date().toISOString();

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, name, email, currency, theme, created_at, updated_at')
      .single();

    if (error || !updatedUser) {
      console.error('[Update Profile] Failed:', error?.message);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to update user profile',
      });
    }

    return res.status(200).json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      currency: updatedUser.currency || 'INR',
      currencySymbol: updatedUser.currency === 'USD' ? '$' : '₹',
      role: 'Pro Member',
      theme: updatedUser.theme || 'dark',
      joinedDate: updatedUser.created_at,
    });
  } catch (error) {
    next(error);
  }
};

export default { getProfile, updateProfile };
