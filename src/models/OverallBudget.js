import mongoose from 'mongoose';

const overallBudgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      default: 50000,
      min: [0, 'Overall budget cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

export const OverallBudget =
  mongoose.models.OverallBudget || mongoose.model('OverallBudget', overallBudgetSchema);
export default OverallBudget;

