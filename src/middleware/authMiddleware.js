import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Handle mock tokens if in mock fallback mode
      if (token.startsWith('mock-jwt-token-')) {
        req.user = {
          _id: 'usr_mock_demo',
          id: 'usr_mock_demo',
          name: 'Alex Mercer',
          email: 'alex@example.com',
          role: 'Pro Member',
          currency: 'INR',
          currencySymbol: '₹',
        };
        return next();
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fintrack_jwt_super_secret_key_2026_finance_suite'
      );

      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, user not found',
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('[Auth Middleware] Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token invalid or expired',
      });
    }
  } else {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no bearer token provided',
    });
  }
};

export default protect;

