# FinTrack PRO — Backend API Service (Supabase PostgreSQL)

Enterprise-grade REST API backend built with **Node.js**, **Express.js**, **Supabase PostgreSQL**, and **JWT Authentication** to power FinTrack PRO.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: Supabase PostgreSQL with `@supabase/supabase-js`
- **Authentication**: JSON Web Tokens (JWT) + BCrypt password hashing (Custom `public.users` table)
- **Security & Utilities**: CORS, Dotenv, Morgan

---

## 📁 Directory Structure

```
backend/
├── src/
│   ├── config/
│   │   └── supabase.js           # Reusable Supabase client & connection health checker
│   ├── controllers/
│   │   ├── authController.js     # Register, Login, GetMe (public.users)
│   │   ├── userController.js     # User profile updates (public.users)
│   │   ├── transactionController.js # CRUD, filtering, sorting, search (transactions)
│   │   ├── budgetController.js   # Category & overall budget management (budgets)
│   │   └── dashboardController.js# Dynamic summary calculations & chart metrics
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT Bearer token authentication & user retrieval
│   │   └── errorMiddleware.js    # PostgreSQL error code handling (23505, 23503, 22P02)
│   ├── routes/
│   │   ├── authRoutes.js         # /api/auth/*
│   │   ├── userRoutes.js         # /api/users/*
│   │   ├── transactionRoutes.js  # /api/transactions/*
│   │   ├── budgetRoutes.js       # /api/budgets/*
│   │   └── dashboardRoutes.js    # /api/dashboard/*
│   ├── utils/
│   │   └── calculations.js       # Pure financial mathematical functions
│   └── server.js                 # Express server bootstrap & Supabase verification
├── .env.example
├── .env
├── .gitignore
├── package.json
└── README.md
```

---

## 🔐 Environment Configuration

Create a `.env` file in `backend/` with the following variables:

```env
PORT=5000
NODE_ENV=development

# Supabase PostgreSQL Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret_key

# JWT & Encryption
JWT_SECRET=your_jwt_secret_key_minimum_32_characters
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=your_32_byte_hex_encryption_key

# Client Application URL (CORS)
CLIENT_URL=http://localhost:5173
```

> **Note:** The `SUPABASE_SERVICE_ROLE_KEY` is kept strictly on the backend and is never exposed to client applications.

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

Server endpoints:
- **Base API**: `http://localhost:5000/api`
- **Health Check**: `http://localhost:5000/api/health`

---

## 📡 API Reference

### Health Check
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/health` | Verifies live Supabase connectivity | No |

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/auth/register` | Register new user in `public.users` with bcrypt `password_hash` | No |
| `POST` | `/api/auth/login` | Authenticate with email & password, returns JWT | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | **Yes (JWT)** |

### User Profile (`/api/users`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `PUT` | `/api/users/profile` | Update profile information | **Yes (JWT)** |

### Transactions (`/api/transactions`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/transactions` | Query transactions (filters: type, category, date, search, sort) | **Yes (JWT)** |
| `POST` | `/api/transactions` | Create new transaction | **Yes (JWT)** |
| `PUT` | `/api/transactions/:id` | Update transaction by ID | **Yes (JWT)** |
| `DELETE` | `/api/transactions/:id` | Delete transaction by ID | **Yes (JWT)** |

### Budgets (`/api/budgets`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/budgets` | Get category spending budgets | **Yes (JWT)** |
| `POST` | `/api/budgets` | Upsert category budget limit | **Yes (JWT)** |
| `PUT` | `/api/budgets/:id` | Update budget limit | **Yes (JWT)** |
| `DELETE` | `/api/budgets/:id` | Delete budget by ID | **Yes (JWT)** |
| `GET` | `/api/budgets/overall` | Get overall monthly spending threshold | **Yes (JWT)** |
| `POST` / `PUT` | `/api/budgets/overall` | Create or update overall monthly spending threshold | **Yes (JWT)** |

### Dashboard & Analytics (`/api/dashboard`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/dashboard/summary` | Get computed balance, income, expenses, savings rate & trends | **Yes (JWT)** |
| `GET` | `/api/dashboard/charts` | Get monthly overview, category donut data, and spending trends | **Yes (JWT)** |
