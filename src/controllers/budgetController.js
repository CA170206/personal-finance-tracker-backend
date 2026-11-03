import Budget from '../models/Budget.js';
import OverallBudget from '../models/OverallBudget.js';

// @desc    Get all category budgets for user
// @route   GET /api/budgets
// @access  Private
export const getBudgets = async (req, res, next) => {
  try {
    const budgets = await Budget.find({ user: req.user._id });
    return res.status(200).json(budgets);
  } catch (error) {
    next(error);
  }
};

// @desc    Create or upsert category budget
// @route   POST /api/budgets
// @access  Private
export const createBudget = async (req, res, next) => {
  try {
    const { category, allocated, period = 'monthly' } = req.body;

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

    // Upsert budget for category
    const budget = await Budget.findOneAndUpdate(
      { user: req.user._id, category: category.trim() },
      {
        user: req.user._id,
        category: category.trim(),
        allocated: numAllocated,
        period,
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(201).json(budget);
  } catch (error) {
    next(error);
  }
};

// @desc    Update existing budget
// @route   PUT /api/budgets/:id
// @access  Private
export const updateBudget = async (req, res, next) => {
  try {
    const { allocated, period } = req.body;

    const budget = await Budget.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found or access denied',
      });
    }

    if (allocated !== undefined) {
      const num = Number(allocated);
      if (isNaN(num) || num < 0) {
        return res.status(400).json({
          success: false,
          message: 'Allocated budget must be a positive number',
        });
      }
      budget.allocated = num;
    }

    if (period) {
      budget.period = period;
    }

    const updated = await budget.save();
    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete category budget
// @route   DELETE /api/budgets/:id
// @access  Private
export const deleteBudget = async (req, res, next) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found or access denied',
      });
    }

    return res.status(200).json({
      success: true,
      id: req.params.id,
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
    const doc = await OverallBudget.findOne({ user: req.user._id });
    return res.status(200).json({
      amount: doc ? doc.amount : 50000,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update overall monthly spending limit
// @route   PUT /api/budgets/overall
// @access  Private
export const updateOverallBudget = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const num = Number(amount);

    if (isNaN(num) || num < 0) {
      return res.status(400).json({
        success: false,
        message: 'Overall budget must be a positive number',
      });
    }

    const doc = await OverallBudget.findOneAndUpdate(
      { user: req.user._id },
      { user: req.user._id, amount: num },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      amount: doc.amount,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getOverallBudget,
  updateOverallBudget,
};

