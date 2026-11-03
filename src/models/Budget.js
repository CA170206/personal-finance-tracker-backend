import mongoose from 'mongoose';

const budgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Please provide a category for the budget'],
      trim: true,
    },
    allocated: {
      type: Number,
      required: [true, 'Please provide an allocated budget amount'],
      min: [0, 'Allocated budget cannot be negative'],
    },
    period: {
      type: String,
      default: 'monthly',
      enum: ['monthly', 'weekly', 'yearly'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// One budget per category per user
budgetSchema.index({ user: 1, category: 1 }, { unique: true });

export const Budget = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);
export default Budget;

