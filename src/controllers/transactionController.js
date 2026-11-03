import Transaction from '../models/Transaction.js';

// @desc    Get all transactions with filtering and sorting
// @route   GET /api/transactions
// @access  Private
export const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { type, category, search, startDate, endDate, sort } = req.query;

    const query = { user: userId };

    // Filter by type
    if (type && type !== 'all') {
      query.type = type;
    }

    // Filter by category
    if (category && category !== 'all') {
      query.category = category;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    // Search by title or notes
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: searchRegex }, { notes: searchRegex }];
    }

    // Determine sorting order
    let sortOption = { date: -1, createdAt: -1 };
    if (sort === 'oldest') {
      sortOption = { date: 1, createdAt: 1 };
    } else if (sort === 'amount-desc') {
      sortOption = { amount: -1 };
    } else if (sort === 'amount-asc') {
      sortOption = { amount: 1 };
    }

    const transactions = await Transaction.find(query).sort(sortOption);
    const total = await Transaction.countDocuments(query);

    return res.status(200).json({
      data: transactions,
      total,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new transaction
// @route   POST /api/transactions
// @access  Private
export const createTransaction = async (req, res, next) => {
  try {
    const { title, amount, type, category, date, notes } = req.body;

    if (!title || amount === undefined || !type || !category || !date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, amount, type, category and date',
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a valid positive number',
      });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "income" or "expense"',
      });
    }

    const transaction = await Transaction.create({
      user: req.user._id,
      title: title.trim(),
      amount: numAmount,
      type,
      category: category.trim(),
      date,
      notes: notes ? notes.trim() : '',
    });

    return res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
};

// @desc    Update an existing transaction
// @route   PUT /api/transactions/:id
// @access  Private
export const updateTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or access denied',
      });
    }

    const { title, amount, type, category, date, notes } = req.body;

    if (title) transaction.title = title.trim();
    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a valid positive number',
        });
      }
      transaction.amount = numAmount;
    }
    if (type && ['income', 'expense'].includes(type)) {
      transaction.type = type;
    }
    if (category) transaction.category = category.trim();
    if (date) transaction.date = date;
    if (notes !== undefined) transaction.notes = notes.trim();

    const updated = await transaction.save();

    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a transaction
// @route   DELETE /api/transactions/:id
// @access  Private
export const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or access denied',
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

export default {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};

