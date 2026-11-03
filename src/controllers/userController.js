import User from '../models/User.js';

// @desc    Update user profile details
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found',
      });
    }

    const { name, currency, currencySymbol, theme } = req.body;

    if (name) user.name = name.trim();
    if (currency) user.currency = currency;
    if (currencySymbol) user.currencySymbol = currencySymbol;
    if (theme && ['dark', 'light'].includes(theme)) user.theme = theme;

    const updatedUser = await user.save();

    return res.status(200).json({
      id: updatedUser._id.toString(),
      name: updatedUser.name,
      email: updatedUser.email,
      currency: updatedUser.currency,
      currencySymbol: updatedUser.currencySymbol,
      role: updatedUser.role,
      theme: updatedUser.theme,
      joinedDate: updatedUser.joinedDate,
    });
  } catch (error) {
    next(error);
  }
};

export default { updateProfile };

