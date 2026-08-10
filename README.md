# VSBEC SMS & Results Management System

Automated SMS Dispatcher, Student & Parent Directory, Semester Results Manager, and Security Key Portal for **VSB Engineering College (Vy Nextgen Technology)**.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure the following key parameters are set in your `.env` file:
```env
PORT=3000
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
JWT_SECRET="VSB_ENGINEERING_COLLEGE_SECRET_KEY_2026"
FAST2SMS_API_KEY="YOUR_FAST2SMS_KEY"
```

### 3. Installation
Install project dependencies:
```bash
npm install
```

### 4. Running in Development Mode
Start the combined Express server and Vite frontend:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

### 5. Production Build & Deployment
Build the application for production:
```bash
npm run build
```

Start the compiled production server:
```bash
npm start
```

---

## 🛠 Features & API Architecture
- **Unified Full-Stack Express Server**: All API endpoints start with `/api/*` and strictly return JSON (`Content-Type: application/json`).
- **404 & Error Guardrails**: Unmatched `/api/*` routes and server errors return JSON error objects rather than falling back to HTML pages.
- **Embedded API Key Auth**: Secure API key authentication using `x-api-key` header or `Authorization: Bearer vsb_live_sk_...`.
- **Fast2SMS & WhatsApp Gateway**: DLT-approved template broadcasting and automated exam result notifications.

---

## 📂 Project Structure
```text
├── server.ts              # Express server entry point & API routes
├── src/
│   ├── components/        # React components (Dashboard, Results, SMS, Settings, etc.)
│   ├── config/            # System API key pre-configurations
│   ├── lib/               # API client, utility functions, and storage
│   ├── server/            # JSON/MongoDB database models
│   └── types.ts           # TypeScript interfaces & types
├── vite.config.ts         # Vite bundler & proxy configuration
└── package.json           # Dependencies and scripts
```
