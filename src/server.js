import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import { checkSupabaseConnection } from './config/supabase.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import bankAccountRoutes from './routes/bankAccountRoutes.js';
import billRoutes from './routes/billRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import importRoutes from './routes/importRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

// Resolve current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure backend/.env is loaded
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for local dev environments
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Root informative endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'FinTrack PRO Backend API',
    status: 'active',
    database: 'Supabase PostgreSQL',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      transactions: '/api/transactions',
      budgets: '/api/budgets',
      dashboard: '/api/dashboard',
      users: '/api/users',
      bankAccounts: '/api/bank-accounts',
      bills: '/api/bills',
      notifications: '/api/notifications',
      import: '/api/import',
      ai: '/api/ai',
    },
  });
});

// Health check endpoint verifying Supabase connectivity
app.get('/api/health', async (req, res) => {
  const dbStatus = await checkSupabaseConnection();

  if (dbStatus.ok) {
    return res.status(200).json({
      status: 'ok',
      service: 'FinTrack PRO API',
      version: '1.0.0',
      database: 'connected',
      provider: 'Supabase PostgreSQL',
      timestamp: new Date().toISOString(),
    });
  } else {
    return res.status(503).json({
      status: 'error',
      service: 'FinTrack PRO API',
      version: '1.0.0',
      database: 'disconnected',
      provider: 'Supabase PostgreSQL',
      error: dbStatus.error,
      timestamp: new Date().toISOString(),
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/import', importRoutes);
app.use('/api/ai', aiRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

// Start Server
const server = app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 FinTrack PRO Backend Server running on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🩺 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🗄️ Database: Supabase PostgreSQL`);
  console.log(`====================================================`);

  // Verify Supabase on startup
  const dbStatus = await checkSupabaseConnection();
  if (dbStatus.ok) {
    console.log(`✅ [FinTrack Supabase] Database connection verified successfully!`);
  } else {
    console.warn(`⚠️ [FinTrack Supabase] Connection verification issue: ${dbStatus.error}`);
  }
});

export default app;
