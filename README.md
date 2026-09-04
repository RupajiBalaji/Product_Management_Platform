# 🚀 Autonomous PM — Lightweight AI Project & Workforce Platform

<p align="center">
  <img src="public/favicon.svg" alt="Autonomous PM Logo" width="80" height="80" />
</p>

<p align="center">
  <b>A modern, high-velocity dual-role project orchestration and daily log tracking platform powered by Google Gemini 3.5 AI and MongoDB.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2.0-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8.1.5-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Express-5.2.1-green?logo=express" alt="Express 5" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas%20%26%20Mongoose%209-47A248?logo=mongodb" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Gemini%20AI-3.5%20Flash--Lite-orange?logo=google" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/Deploy-Render%20Ready-46E3B7?logo=render" alt="Render Ready" />
</p>

---

## 🌟 Overview

Traditional enterprise project management tools (Jira, Asana, Monday.com) are frequently over-engineered for fast-moving technical teams—demanding exhaustive ticket configurations and rigid status updates that employees resist. Unstructured chats (Slack, WhatsApp) lead to lost context and zero executive visibility.

**Autonomous PM** solves this with a streamlined, dual-role operational platform:
1. **Project Managers (PM / Overseer)**: Allocate multi-project contributors, flag high-priority milestones, inspect live interactive Calendar Matrix logs, and generate 5-dimension AI executive briefs.
2. **Developers (Contributors)**: See prioritized deliverables, focus on high-priority projects, submit daily work logs and blockers with zero overhead, and receive instant AI assistance.

---

## ✨ Core Features

### 1. 🛡️ 3-Tier Governance & Role-Based Access Control (RBAC)
- **Product Lead (`product_lead`)**: Full sovereign command authority (`/pm/dashboard`, `/pm/projects`, `/pm/roles`, `/pm/employees`, `/pm/ai-hub`).
- **Lead Architect (`lead_architect`)**: Elevated oversight permissions—reviews architectural appeals, audits technical allocations, and inspects cross-project telemetry.
- **Contributor / Employee (`employee`)**: Distraction-free workspace (`/employee/dashboard`, `/employee/tasks/$taskId/log`) focused on assigned deliverables.
- **Append-Only Audit Registry (`AuditLog`)**: Immutable audit trail automatically recording every sensitive write operation (`actorId`, `action`, `entityType`, `entityId`, `before`, `after`, `timestamp`).

### 2. ⚡ Dynamic Role Engine (Phase 1)
- **Granular Capability Taxonomy**: Define custom roles (`title`, `domain`, `description`, `skillTags`, `defaultDailyCapHours`).
- **Pre-Seeded Roles**: Lead Solutions Architect, Senior Backend Engineer, UI/UX Design Specialist, Growth Copywriter, QA & Test Automation Lead.
- **Dedicated Admin Control (`/pm/roles`)**: Product Lead interface with interactive skill tag chips, domain badges, and daily cap hours configuration.
- **Project Team Allocation with Roles**: Projects assign team members with specific DynamicRoles and daily hour allocations rather than generic memberships.

### 2. 📅 Interactive Calendar Matrix GUI
- **Day-by-Day Contributor Matrix**: Interactive grid showing real-time contributor status (`Completed`, `In Progress`, `Blocked`, `No Log`).
- **Instant Log Inspector Modal**: Click any log cell to inspect submitted deliverables, actual hours spent, blocker descriptions, and PR links.

### 3. 👥 Employee 360 & Workload Capacity Engine
- **Capacity Gauge**: Visual circular gauge displaying real-time allocation percentage across all active projects.
- **Multi-Project Team Allocation**: Add and remove contributors from projects with automatic role matching.
- **High-Priority Project Guardrail**: Mark critical initiatives as **High Priority** so developers with multiple commitments know where to focus first.
- **1-Click Dossier Export**: Generate and print clean executive performance dossiers.

### 4. 🧠 5-Dimension AI Summary & Copilot Hub
- **Single-Log & Multi-Log Summaries**: Synthesize daily standup entries into concise bulleted highlights.
- **Project-Level & Sprint Velocity Insights**: Identify critical-path blockers and predict delivery variance.
- **Employee 360 & Org-Wide Synthesis**: Executive health checks across engineering, design, and QA.
- **Smart Gemini 3.5 AI Copilot**: Ultra-concise, direct 1–3 line answers for quick questions, reserving deep breakdowns for explicit prompts.

---

## 🏗️ Full-Stack Architecture

```
autonomous-project-pilot/
├── server/                         # Express 5 REST API Backend
│   ├── index.js                    # Express server entry point & SPA static serving
│   ├── db.js                       # Mongoose 9 MongoDB Atlas connection & DNS resolver
│   ├── models/                     # Mongoose Schemas (User, Project, Task, Log, Session)
│   ├── middleware/                 # JWT & Role Authentication Middleware
│   ├── routes/                     # REST API Endpoints
│   │   ├── auth.js                 # Session cookies & Firebase / Mongo auth
│   │   ├── projects.js             # Project CRUD, team allocation & priority toggle
│   │   ├── tasks.js                # Task assignment & status management
│   │   ├── logs.js                 # Daily work logs & blocker tracking
│   │   ├── users.js                # Employee directory & capacity calculation
│   │   ├── analytics.js            # KPI metrics & matrix data aggregation
│   │   └── ai.js                   # Google Gemini 3.5 Flash-Lite AI Hub & Copilot
│   └── seed.js                     # Demo dataset seeder
├── src/                            # Vite + React 19 Frontend
│   ├── components/                 # UI Primitives, Navigation & AI Copilot Sidebar
│   ├── context/                    # AuthContext (Firebase + MongoDB Session)
│   ├── lib/                        # API client, DB layer, types, Firebase & Gemini SDKs
│   ├── routes/                     # TanStack Router Pages
│   │   ├── login.tsx               # Dual-role signup & login
│   │   ├── pm.dashboard.tsx        # Project Manager Command Dashboard
│   │   ├── pm.projects.index.tsx   # Project Portfolio View
│   │   ├── pm.projects.$projectId.tsx # Project Detail & Team Allocation
│   │   ├── pm.projects.$projectId.matrix.tsx # Interactive Calendar Matrix
│   │   ├── pm.employees.tsx        # Workforce Directory
│   │   ├── pm.employees.$employeeId.tsx # Employee 360 Profile & Capacity Gauge
│   │   ├── pm.ai-hub.tsx           # Multi-Dimension AI Summary Engine
│   │   ├── employee.dashboard.tsx  # Developer Workspace & Priority Banner
│   │   └── employee.tasks.$taskId.log.tsx # Daily Work Submission Form
│   └── styles.css                  # Modern Glassmorphism & SaaS Design System
├── render.yaml                     # Render Blueprint for 1-Click Deployment
├── RENDER_DEPLOYMENT_GUIDE.md      # Step-by-step production deployment instructions
└── package.json                    # Unified full-stack dependencies & scripts
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** `>= 20.0.0`
- **MongoDB** (Local instance on `mongodb://localhost:27017` or free [MongoDB Atlas](https://cloud.mongodb.com))
- **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/))

### 2. Installation
```bash
git clone https://github.com/RupajiBalaji/autonomous-project-manager.git
cd autonomous-project-manager
npm install
```

### 3. Environment Variables Setup
Create a `.env` file in the root directory (or copy from `.env.example`):
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/acube-pm
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=your_jwt_secret_key_here

# Firebase Auth Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Run Development Servers
```bash
# Terminal 1: Run Express API Server
npm run server

# Terminal 2: Run Vite Frontend
npm run dev
```
Open **`http://localhost:5173`** in your browser!

---

## 🌐 Deploy to Render (1-Click Production)

The repository is configured as a **Unified Web Service** on Render where Express serves both API routes (`/api/*`) and the built React frontend (`dist/`):

1. Go to [Render Dashboard](https://dashboard.render.com) ➜ **New +** ➜ **Web Service**.
2. Connect your repository: `RupajiBalaji/autonomous-project-manager`.
3. Configure the build:
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = `mongodb+srv://<user>:<pass>@cluster0.../acube-pm`
   - `GEMINI_API_KEY` = `your_gemini_key`
   - `JWT_SECRET` = `your_secret_key`
   - `VITE_FIREBASE_*` = `your_firebase_keys`
5. In **MongoDB Atlas** ➜ **Network Access** ➜ Add IP `0.0.0.0/0` ("Allow Access from Anywhere").
6. Click **Create Web Service**!

> For full step-by-step instructions with screenshots, refer to [`RENDER_DEPLOYMENT_GUIDE.md`](./RENDER_DEPLOYMENT_GUIDE.md).

---

## 📡 Core API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/session` | Create/sync user session cookie with role |
| `GET` | `/api/auth/me` | Fetch authenticated session profile |
| `POST` | `/api/auth/logout` | Clear HTTP-only session cookie |
| `GET` | `/api/projects` | List all projects with progress & priority |
| `POST` | `/api/projects` | Create a new project sandbox |
| `PATCH` | `/api/projects/:id` | Update project priority or team members |
| `GET` | `/api/tasks` | Fetch tasks filtered by project or employee |
| `POST` | `/api/tasks` | Create deliverable with priority flag |
| `POST` | `/api/logs` | Submit daily work log with blocker status |
| `GET` | `/api/analytics/matrix/:projectId` | Aggregate day-by-day contributor calendar grid |
| `POST` | `/api/ai/summarize` | Generate multi-dimension executive synthesis |
| `POST` | `/api/ai/chat` | Context-aware AI Copilot query endpoint |

---

## 🔒 Security & Best Practices

- **Signed HTTP-Only Cookies**: Secure authentication sessions with automatic production HTTPS flags (`SameSite=None`, `Secure`).
- **Strict Role Boundaries**: Project management routes and actions are protected via server-side verification middleware.
- **Automated Fallbacks**: Integrated public DNS resolvers for resilient MongoDB Atlas cloud connectivity.

---

## 📄 License

This project is licensed under the **MIT License**.
