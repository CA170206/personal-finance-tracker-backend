import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Verify JWT signature using our Express JWT secret
      const secret =
        process.env.JWT_SECRET || 'fintrack_jwt_super_secret_key_2026_finance_suite';
      const decoded = jwt.verify(token, secret);

      if (!decoded || !decoded.id) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, invalid token payload',
        });
      }

      // Query custom public.users table in Supabase PostgreSQL
      const { data: user, error } = await supabase
        .from('users')
        .select('id, name, email, currency, theme, created_at, updated_at')
        .eq('id', decoded.id)
        .single();

      if (error || !user) {
        return res.status(401).json({
          success: false,
          message: 'Not authorized, user not found',
        });
      }

      // Attach user to req with both id and _id aliases for full compatibility
      req.user = {
        ...user,
        _id: user.id,
        role: 'Pro Member',
        currencySymbol: user.currency === 'USD' ? '$' : '₹',
        joinedDate: user.created_at,
      };

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
