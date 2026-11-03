import { supabase } from '../config/supabase.js';

// Helper to format budget records for frontend compatibility
const formatBudget = (row) => ({
  id: row.id,
  category: row.category,
  allocated: Number(row.amount),
  period: 'monthly',
  name: row.name,
  month: row.month,
  year: row.year,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// @desc    Get all category budgets for user
// @route   GET /api/budgets
// @access  Private
export const getBudgets = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data: budgets, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .neq('category', 'Overall')
      .order('category', { ascending: true });

    if (error) {
      console.error('[Get Budgets] Query failed:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve budgets from database',
      });
    }

    return res.status(200).json((budgets || []).map(formatBudget));
  } catch (error) {
    next(error);
  }
};

// @desc    Create or upsert category budget
// @route   POST /api/budgets
// @access  Private
export const createBudget = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { category, allocated, name } = req.body;

    if (!category || allocated === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide category and allocated budget limit',
      });
    }

    const numAllocated = Number(allocated);
    if (isNaN(numAllocated) || numAllocated < 0) {
      return res.status(400).json({
        success: false,
        message: 'Allocated budget must be a positive number',
      });
    }

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const budgetName = name || `${category.trim()} Budget`;

    // Check if category budget already exists for this user
    const { data: existing } = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', userId)
      .eq('category', category.trim())
      .maybeSingle();

    let result;
    if (existing) {
      // Update existing category budget
      const { data, error } = await supabase
        .from('budgets')
        .update({
          name: budgetName,
          amount: numAllocated,
          month: curMonth,
          year: curYear,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new category budget
      const { data, error } = await supabase
        .from('budgets')
        .insert([
          {
            user_id: userId,
            name: budgetName,
            category: category.trim(),
            amount: numAllocated,
            month: curMonth,
            year: curYear,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return res.status(201).json(formatBudget(result));
  } catch (error) {
    next(error);
  }
};

// @desc    Get single category budget by ID
// @route   GET /api/budgets/:id
// @access  Private
export const getBudgetById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: budget, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !budget) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found or access denied',
      });
    }

    return res.status(200).json(formatBudget(budget));
  } catch (error) {
    next(error);
  }
};

// @desc    Update existing budget
// @route   PUT /api/budgets/:id
// @access  Private
export const updateBudget = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { allocated, name, category } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (allocated !== undefined) {
      const num = Number(allocated);
      if (isNaN(num) || num < 0) {
        return res.status(400).json({
          success: false,
          message: 'Allocated budget must be a positive number',
        });
      }
      updates.amount = num;
    }

    if (name) updates.name = name.trim();
    if (category) updates.category = category.trim();

    const { data: updated, error } = await supabase
      .from('budgets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !updated) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found or access denied',
      });
    }

    return res.status(200).json(formatBudget(updated));
  } catch (error) {
    next(error);
  }
};

// @desc    Delete category budget
// @route   DELETE /api/budgets/:id
// @access  Private
export const deleteBudget = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found or access denied',
      });
    }

    return res.status(200).json({
      success: true,
      id,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get overall monthly spending limit
// @route   GET /api/budgets/overall
// @access  Private
export const getOverallBudget = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('budgets')
      .select('amount')
      .eq('user_id', userId)
      .eq('category', 'Overall')
      .maybeSingle();

    if (error) {
      console.error('[Get Overall Budget] Query error:', error.message);
    }

    return res.status(200).json({
      success: true,
      amount: data ? Number(data.amount) : 50000,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or update overall monthly spending limit
// @route   POST /api/budgets/overall
// @route   PUT /api/budgets/overall
// @access  Private
export const setOverallBudget = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const rawAmount = req.body.amount !== undefined ? req.body.amount : req.body.allocated;

    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
      return res.status(400).json({
        success: false,
        message: 'Please provide an amount for the overall budget',
      });
    }

    const num = Number(rawAmount);
    if (isNaN(num) || num < 0) {
      return res.status(400).json({
        success: false,
        message: 'Overall budget must be a positive number',
      });
    }

    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const { data: existing } = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', userId)
      .eq('category', 'Overall')
      .maybeSingle();

    let saved;
    if (existing) {
      const { data, error } = await supabase
        .from('budgets')
        .update({
          name: 'Overall Monthly Budget',
          amount: num,
          month: curMonth,
          year: curYear,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from('budgets')
        .insert([
          {
            user_id: userId,
            name: 'Overall Monthly Budget',
            category: 'Overall',
            amount: num,
            month: curMonth,
            year: curYear,
          },
        ])
        .select()
        .single();

      if (error) throw error;
      saved = data;
    }

    const statusCode = req.method === 'POST' && !existing ? 201 : 200;
    return res.status(statusCode).json({
      success: true,
      amount: Number(saved.amount),
    });
  } catch (error) {
    next(error);
  }
};

export const updateOverallBudget = setOverallBudget;

export default {
  getBudgets,
  getBudgetById,
  createBudget,
  updateBudget,
  deleteBudget,
  getOverallBudget,
  setOverallBudget,
  updateOverallBudget,
};
