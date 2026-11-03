import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';

// Helper to generate JWT token using the Express secret
const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'fintrack_jwt_super_secret_key_2026_finance_suite',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// @desc    Register a new user in public.users
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, email and password',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const emailLower = email.toLowerCase().trim();

    // Check if user already exists in public.users
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailLower)
      .maybeSingle();

    if (checkError) {
      console.error('[Register] Error checking existing user:', checkError.message);
      return res.status(500).json({
        success: false,
        message: 'Database error checking user existence',
      });
    }

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    // Hash password with bcryptjs
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user into custom public.users table
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          name: name.trim(),
          email: emailLower,
          password_hash,
          currency: 'INR',
          theme: 'dark',
        },
      ])
      .select('id, name, email, currency, theme, created_at, updated_at')
      .single();

    if (insertError || !newUser) {
      console.error('[Register] User creation failed:', insertError?.message);
      return res.status(500).json({
        success: false,
        message: insertError?.message || 'Failed to create user account',
      });
    }

    const token = generateToken(newUser.id);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        currency: newUser.currency || 'INR',
        currencySymbol: newUser.currency === 'USD' ? '$' : '₹',
        role: 'Pro Member',
        theme: newUser.theme || 'dark',
        joinedDate: newUser.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    const emailLower = email.toLowerCase().trim();

    // Query custom public.users table for user with password_hash
    const { data: user, error: queryError } = await supabase
      .from('users')
      .select('id, name, email, password_hash, currency, theme, created_at')
      .eq('email', emailLower)
      .maybeSingle();

    if (queryError) {
      console.error('[Login] Error querying user:', queryError.message);
      return res.status(500).json({
        success: false,
        message: 'Database error during authentication',
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials',
      });
    }

    // Verify bcrypt password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials',
      });
    }

    const token = generateToken(user.id);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        currency: user.currency || 'INR',
        currencySymbol: user.currency === 'USD' ? '$' : '₹',
        role: 'Pro Member',
        theme: user.theme || 'dark',
        joinedDate: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
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

export default { register, login, getMe };
