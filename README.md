# FinTrack PRO — Backend API Service

Robust, enterprise-grade REST API backend built with **Node.js**, **Express.js**, **MongoDB (Mongoose)**, and **JWT Authentication** to power FinTrack PRO.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT) + BCrypt password hashing
- **Security & Utilities**: CORS, Dotenv, Morgan

---

## 📁 Directory Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.js                 # MongoDB connection manager with timeout resilience
│   ├── controllers/
│   │   ├── authController.js     # Register, Login, GetMe
│   │   ├── userController.js     # User profile updates
│   │   ├── transactionController.js # CRUD, filtering, sorting, search
│   │   ├── budgetController.js   # Category & overall budget management
│   │   └── dashboardController.js# Dynamic summary calculations & chart metrics
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT Bearer token authentication
│   │   └── errorMiddleware.js    # Centralized HTTP error handler
│   ├── models/
│   │   ├── User.js               # User schema with bcrypt pre-save hook
│   │   ├── Transaction.js        # Transaction schema with compound user/date index
│   │   ├── Budget.js             # Category spending limits
│   │   └── OverallBudget.js      # Global monthly threshold
│   ├── routes/
│   │   ├── authRoutes.js         # /api/auth/*
│   │   ├── userRoutes.js         # /api/users/*
│   │   ├── transactionRoutes.js  # /api/transactions/*
│   │   ├── budgetRoutes.js       # /api/budgets/*
│   │   └── dashboardRoutes.js    # /api/dashboard/*
│   ├── scripts/
│   │   └── seed.js               # Realistic demo seeder with 20 transactions
│   ├── utils/
│   │   └── calculations.js       # Pure financial mathematical functions
│   └── server.js                 # Express server bootstrap & route mounting
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default variables:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/fintrack
JWT_SECRET=fintrack_jwt_super_secret_key_2026_finance_suite
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

### 3. Seed Demo Data (Optional)

Populates the database with the preconfigured demo user (`alex@example.com` / `demo1234`) and 20 realistic financial records:

```bash
npm run seed
```

### 4. Run Development Server

```bash
npm run dev
```

The server starts at `http://localhost:5000/api`.

---

## 📡 API Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/auth/register` | Register new user account | No |
| `POST` | `/api/auth/login` | Authenticate with email & password | No |
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
| `PUT` | `/api/budgets/overall` | Update overall monthly spending threshold | **Yes (JWT)** |

### Dashboard & Analytics (`/api/dashboard`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/dashboard/summary` | Get computed balance, income, expenses, savings rate & trends | **Yes (JWT)** |
| `GET` | `/api/dashboard/charts` | Get monthly overview, category donut data, and spending trends | **Yes (JWT)** |

