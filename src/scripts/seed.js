import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';
import OverallBudget from '../models/OverallBudget.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fintrack';

const seedData = async () => {
  try {
    console.log('[FinTrack Seeder] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('[FinTrack Seeder] Connected to database');

    // 1. Clean existing demo data
    const demoEmail = 'alex@example.com';
    const existingDemo = await User.findOne({ email: demoEmail });
    if (existingDemo) {
      console.log('[FinTrack Seeder] Clearing previous demo data...');
      await Transaction.deleteMany({ user: existingDemo._id });
      await Budget.deleteMany({ user: existingDemo._id });
      await OverallBudget.deleteMany({ user: existingDemo._id });
      await User.deleteOne({ _id: existingDemo._id });
    }

    // 2. Create Demo User
    console.log('[FinTrack Seeder] Creating Demo User: Alex Mercer...');
    const demoUser = await User.create({
      name: 'Alex Mercer',
      email: demoEmail,
      password: 'demo1234',
      currency: 'INR',
      currencySymbol: '₹',
      role: 'Pro Member',
      theme: 'dark',
    });

    const uid = demoUser._id;

    // Helper for relative dates
    const daysAgo = (days) => {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d.toISOString().split('T')[0];
    };

    // 3. Realistic Demo Transactions (20 items across categories)
    const transactions = [
      {
        user: uid,
        title: 'Monthly Tech Salary',
        amount: 45000,
        type: 'income',
        category: 'Salary',
        date: daysAgo(2),
        notes: 'Monthly tech developer remuneration',
      },
      {
        user: uid,
        title: 'Freelance UI/UX Design System',
        amount: 18500,
        type: 'income',
        category: 'Freelance',
        date: daysAgo(14),
        notes: 'Fintech client mobile app wireframes',
      },
      {
        user: uid,
        title: 'Dividend Payout - Nifty 50 Index',
        amount: 3200,
        type: 'income',
        category: 'Investment',
        date: daysAgo(22),
        notes: 'Quarterly ETF dividend credit',
      },
      {
        user: uid,
        title: 'Apartment Rent & Maintenance',
        amount: 8000,
        type: 'expense',
        category: 'Housing',
        date: daysAgo(3),
        notes: 'Monthly high-rise apartment rent via UPI',
      },
      {
        user: uid,
        title: 'Weekly Organic Grocery Restock',
        amount: 2450,
        type: 'expense',
        category: 'Food & Dining',
        date: daysAgo(1),
        notes: 'Nature Basket organic produce & pantry staples',
      },
      {
        user: uid,
        title: 'Artisan Coffee & Team Bistro',
        amount: 680,
        type: 'expense',
        category: 'Food & Dining',
        date: daysAgo(4),
        notes: 'Cold brew and brunch with colleagues',
      },
      {
        user: uid,
        title: 'Fine Dining Weekend Dinner',
        amount: 1840,
        type: 'expense',
        category: 'Food & Dining',
        date: daysAgo(8),
        notes: 'Family weekend dinner at Spice Terrace',
      },
      {
        user: uid,
        title: 'Electricity & Utility Bill',
        amount: 1200,
        type: 'expense',
        category: 'Utilities',
        date: daysAgo(5),
        notes: 'State electricity board online payment',
      },
      {
        user: uid,
        title: 'Gigabit Fiber Internet Subscription',
        amount: 999,
        type: 'expense',
        category: 'Utilities',
        date: daysAgo(9),
        notes: 'High-speed broadband monthly auto-debit',
      },
      {
        user: uid,
        title: 'Fuel Refill - High Octane',
        amount: 2100,
        type: 'expense',
        category: 'Transportation',
        date: daysAgo(6),
        notes: 'Full tank fuel at Shell station',
      },
      {
        user: uid,
        title: 'Metro Smart Card Recharge',
        amount: 500,
        type: 'expense',
        category: 'Transportation',
        date: daysAgo(12),
        notes: 'Rapid transit monthly metro pass',
      },
      {
        user: uid,
        title: 'Streaming & Cloud Subscriptions',
        amount: 799,
        type: 'expense',
        category: 'Entertainment',
        date: daysAgo(7),
        notes: 'Netflix 4K UHD & Spotify Premium bundle',
      },
      {
        user: uid,
        title: 'IMAX Cinema Tickets & Snacks',
        amount: 850,
        type: 'expense',
        category: 'Entertainment',
        date: daysAgo(15),
        notes: 'Sci-fi movie screening tickets',
      },
      {
        user: uid,
        title: 'Dental Checkup & Consultation',
        amount: 1500,
        type: 'expense',
        category: 'Healthcare',
        date: daysAgo(11),
        notes: 'Annual preventative dental cleaning',
      },
      {
        user: uid,
        title: 'Ergonomic Mechanical Keyboard',
        amount: 3499,
        type: 'expense',
        category: 'Shopping',
        date: daysAgo(16),
        notes: 'Wireless mechanical keyboard for workstation',
      },
      {
        user: uid,
        title: 'Mutual Fund SIP Auto-Debit',
        amount: 5000,
        type: 'expense',
        category: 'Investment',
        date: daysAgo(10),
        notes: 'Monthly disciplined index fund accumulation',
      },
      {
        user: uid,
        title: 'Gym & Fitness Center Membership',
        amount: 1800,
        type: 'expense',
        category: 'Personal',
        date: daysAgo(18),
        notes: 'Monthly gym and pool facility access',
      },
      {
        user: uid,
        title: 'Technical Cloud Certification Course',
        amount: 2200,
        type: 'expense',
        category: 'Education',
        date: daysAgo(20),
        notes: 'AWS Solutions Architect professional exam voucher',
      },
      {
        user: uid,
        title: 'Weekend Farmer Market Supplies',
        amount: 720,
        type: 'expense',
        category: 'Food & Dining',
        date: daysAgo(21),
        notes: 'Fresh artisanal bakery sourdough and honey',
      },
      {
        user: uid,
        title: 'Consulting Honorarium',
        amount: 6000,
        type: 'income',
        category: 'Freelance',
        date: daysAgo(25),
        notes: 'Architecture review for early-stage fintech',
      },
    ];

    console.log(`[FinTrack Seeder] Inserting ${transactions.length} realistic transactions...`);
    await Transaction.insertMany(transactions);

    // 4. Budgets
    console.log('[FinTrack Seeder] Configuring category budgets...');
    await Budget.create([
      { user: uid, category: 'Housing', allocated: 8500 },
      { user: uid, category: 'Food & Dining', allocated: 6000 },
      { user: uid, category: 'Transportation', allocated: 3000 },
      { user: uid, category: 'Utilities', allocated: 2500 },
      { user: uid, category: 'Entertainment', allocated: 2000 },
    ]);

    // 5. Overall Budget
    await OverallBudget.create({
      user: uid,
      amount: 50000,
    });

    console.log('---------------------------------------------------------');
    console.log('✅ Demo database seeded successfully!');
    console.log('Credentials: alex@example.com / demo1234');
    console.log('---------------------------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seedData();

