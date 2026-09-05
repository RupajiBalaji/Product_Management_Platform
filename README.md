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

### 3. 🕸️ Task Dependency Graph (DAG) & Cycle Detection (Phase 2)
- **Directed Acyclic Graph (DAG) Engine**: Enforce strict prerequisite execution dependencies (`depends_on: [TaskId]`) and hours estimation (`estimate_hours`, `logged_hours`).
- **Zero-Cycle Guarantee**: Integrated pure DFS graph coloring cycle detector (`checkForCycle`) returning exact circular paths (e.g., `Task A → Task B → Task C → Task A`) on HTTP 409 conflict.
- **Prerequisite Delete Guard**: Blocks deletion of any task if other downstream tasks depend on it, preventing dangling references.
- **DAG Topology Visualizer**: Interactive topology viewer breaking project work into Independent Roots (Ready to Execute) and Chained Milestones.

### 4. ⚖️ Global Capacity Registry & Priority Conflict Resolution (Phase 3)
- **P1/P2/P3 Priority Governance Model**: Single-source-of-truth priority classification: P1 (Mission-Critical), P2 (High-Value), P3 (Strategic).
- **Global Allocation Ledger (`server/lib/capacityRegistry.js`)**: Real-time aggregation of daily hour commitments across all active initiatives compared against per-user or dynamic-role capacity caps.
- **Capacity Conflict Gate**: Intercepts `POST /api/projects/:id/members`, evaluating total load against max daily capacity and returning HTTP 409 with overflow metrics and priority-weighted resolution recommendations.
- **Priority-Weighted Displacement Suggestions**: Lower-priority projects yield hours to higher-priority incoming work; P1 projects are strictly protected from displacement by P2/P3 requests.
- **Sovereign Override & Audit Protection**: Product Leads can force-override capacity conflicts (`force: true`), recording an immutable `CAPACITY_OVERRIDDEN` event in the append-only `AuditLog`.
- **Global Capacity Ledger View (`/pm/capacity`)**: Dedicated portfolio table showing real-time utilization bars, over-allocation alerts, and commitment breakdowns.

### 5. 🎯 QA Definition-of-Done Gate, Dual Evaluation & Appeals (Phase 4)
- **Automated QA Gate**: Enforces strict Definition-of-Done criteria before tasks can transition to `completed`.
- **Dual Evaluation Modes (`evaluationMode`)**:
  - **`objective`**: Strict automated validation for Engineering, Backend, and QA roles. Google Gemini evaluates artifacts against task criteria in structured JSON format (`passed`, `missing_items`, `reasoning`), auto-approving or rejecting and tracking `rejection_count`.
  - **`subjective`**: Structural validation (valid Figma/PR URL, minimum text length) with mandatory human review (`pending_review`) for UI/UX Design, Copywriting, and Creative roles.
- **Fail-Safe Fallback**: If Gemini encounters network or quota errors (e.g. HTTP 429), submissions automatically land in `pending_review` with human review notifications to prevent delivery bottlenecks.
- **Unified Review & Appeals Queue (`/pm/reviews`)**: Dedicated interface for Product Leads and Lead Architects with two-pane inspection, one-click deliverable approval/rejection, and appeal adjudication.
- **Contested Appeal Mechanism**: Employees can contest rejected deliverables with justifications; Lead/Architect overrides flip submissions directly to `approved`, update task status, and record an immutable `APPEAL_RESOLVED` event in `AuditLog`.

### 6. 🚨 3-Day Slippage Detection & Repeated QA-Rejection Loop Detection (Phase 5)
- **Automated Slippage Detection Engine (`server/jobs/slippageChecker.js`)**: Scheduled via `node-cron` (daily at 00:05) and callable via `POST /api/internal/run-slippage-check` (protected by `x-internal-secret`).
- **3-Day Partial Work Streak Tracker**: Pure logic module (`calculatePartialWorkStreak`) calculating consecutive incomplete work days:
  - 0–1 days → `normal`
  - 2 days → `warning` (horizontal Day 1 → Day 2 progress badge)
  - 3+ days → `escalation` (prominent Product Lead alert panel, notification dispatched)
- **Repeated QA-Rejection Loop Detector**: Pure logic module (`calculateRepeatedRejectionLoop`) tracking consecutive rejections on tasks:
  - 2 rejections → Pre-escalation warning badge on task card (`Streak: 2/3`)
  - 3+ rejections → Automatic escalation alert to Product Lead
  - Seamless override integration: An appeal override resets the streak immediately.
- **Structured Escalation Alerts (`buildEscalationAlert`)**: Actionable remediation cards with 3 resolution options:
  - Partial Work Streak: `["Reassign overflow", "Schedule 1-on-1", "Extend milestone"]`
  - QA Rejection Loop: `["Schedule clarification session", "Reassign to experienced teammate", "Simplify acceptance criteria"]`
- **Sovereign Resolution & Audit Trail**: `POST /api/slippage/:id/resolve` records chosen option, marks `resolved: true`, and logs an immutable `SLIPPAGE_EVENT_RESOLVED` event in `AuditLog`.

### 7. 🔀 Employee Action Mode & Clarification Workflow (Phase 6)
- **Autonomous Task Reordering (`POST /api/actions/reorder`)**: Employees can reorder their assigned execution sequence. Pure logic validator (`evaluateReorder`) ensures no prerequisite dependencies or downstream dependents in the DAG are violated. Auto-approved (HTTP 200) or blocked with DAG conflict path (HTTP 409).
- **Within-Week Swapping (`POST /api/actions/swap`)**: Reassign milestone due dates to any weekday in the current planning week (Monday–Sunday). Pure logic validator (`evaluateSwapWithinWeek`) verifies week boundaries and ensures projected workload does not exceed the 40-hour weekly cap.
- **Strict Postpone Governance (`POST /api/actions/postpone`)**: Arbitrary milestone postponements are strictly prohibited by governance rules to prevent project delivery slippage. Blocked with HTTP 403 and logged to `ActionRequest`.
- **Requirements Clarification & Slippage Freezing (`POST /api/actions/request-clarification`)**: Employees can ask questions on specifications. Google Gemini AI immediately scans project PRD/description text to provide instant answers; if specifications are missing, `slippage_frozen` is set to `true`, freezing the 3-day slippage timer and alerting the Product Lead.
- **Clarification Review Queue & Answer System (`/pm/reviews` & `POST /api/actions/clarifications/:id/answer`)**: Product Leads and Lead Architects review open clarification requests, submit answers, automatically unfreeze the task's slippage clock, append the Q&A to the task history, and log to `AuditLog`.

### 8. 🌿 Sub-Task Decomposition & Task Execution Priority (Phase 7)
- **Sub-Task Decomposition (`POST /api/tasks/:id/subtasks`)**: Decompose complex tasks into granular sub-tasks with optional acceptance criteria overrides, estimated hours, and inherited project scope.
- **Rollup Progress Tracking (`GET /api/tasks/:id/progress`)**: Live calculation of completion percentages based on completed sub-tasks with 0%/100% fallback for standalone tasks.
- **Critical Path (CPM) & Downstream Blocker Priority Engine (`server/lib/taskPriority.js`)**: Pure logic Critical Path Method (CPM) calculates earliest/latest start/finish and slack times. Assigns:
  - **P0**: High-impact blockers (blocking $\ge 2$ downstream tasks) or zero-slack critical path milestones.
  - **P1**: Single dependency blockers or urgent deadlines ($\le 3$ days remaining).
  - **P2**: Normal independent execution with ample schedule buffer.
- **Automated Priority Recalculation (`POST /api/tasks/project/:id/recalculate-priorities`)**: Triggered via API and automatically recalculated whenever DAG dependencies change.
- **Mid-Day P0 Nudge Engine (`server/jobs/priorityNudge.js`)**: Scheduled daily at 12:00 PM to detect active P0 tasks with 0 logged activity for the day, dispatching urgent nudges to assigned contributors with built-in daily idempotency.
- **Enhanced Daily Queue & Priority Badging**: Employee dashboard prioritizes work by P0 $\to$ P1 $\to$ P2 with reasoning tooltips, sub-task progress bars, and dedicated blocker filters.

### 9. 📊 Multi-Project Portfolio Dashboard & Budget/Cost Tracking (Phase 8)
- **Executive Portfolio Dashboard (`/pm/portfolio`)**: Centralized command view for Product Leads and Lead Architects displaying all active initiatives with priority badges, composite health indicators, and pending action counts.
- **Top-Line Action Counter**: Portfolio-wide aggregation tracking total unresolved 3-day slippages, pending Definition-of-Done appeals, and unaddressed PRD clarifications.
- **Composite Project Health Engine (`server/lib/costCalculator.js`)**: Pure logic calculator synthesizing delivery risk into traffic-light indicators:
  - **`green`**: No unresolved escalations, budget on track ($\le 105\%$).
  - **`yellow`**: Warning-level slippages, budget warning (105%–115%), or tasks exceeding estimates by 50%+.
  - **`red`**: Critical escalations or severe budget overrun ($> 115\%$).
- **Confidential Compensation & Budget Projection**:
  - `hourly_cost_rate` stored securely on users, strictly restricted from non-Product Lead roles (completely omitted from API responses, not just zeroed).
  - Live budget burn extrapolation: `budgetedCost`, `actualCostBurned`, `remainingBudget`, `projectedFinalCost`, and `burnPct`.
  - Dedicated Budget Burn panel on Project Detail view (`/pm/projects/$projectId`), visible exclusively to Product Leads.
  - Dedicated confidential hourly rate editor on employee profile view (`/pm/employees/$employeeId`) with immutable `COST_RATE_UPDATED` audit trails.
- **Global Resource Utilization Heatmap**: Stacked horizontal visualization comparing committed daily hours against employee capacity caps, with color-coded priority segments (P1 Red, P2 Amber, P3 Blue).
- **Scope Change Consequence Analysis**: Pure logic calculator (`calculateCostDelta`) formatting scope impact into executive deltas (e.g. `"+45 hours × $120/hr = +$5,400"`).

### 10. 💬 Subject Matter Expert (SME) Invites & Intake Deliberation (Phase 9)
- **Scoped SME Advisory Model**: Product Leads can invite specialized internal experts (`invited_expert`) during project intake to deliberate on architecture, feasibility, and technical scope without exposing sensitive initiative data.
- **Strict Allowlist Filtering (`server/lib/creationThreadAccess.js`)**: Pure logic security gate returning strictly the conversation thread, title, and intent. Critical financial keys (`budgeted_cost`, `hourly_cost_rate`, `team_allocations`, `burnPct`) are guaranteed absent from SME responses.
- **Creation Deliberation Thread (`server/models/CreationThread.js`)**:
  - Author role snapshots at time of posting: `product_lead`, `invited_expert`, or `lead_architect`.
  - Scoped RBAC access rules (`canAccessCreationThread`): Product Leads have universal access, assigned Lead Architects have project access, and invited experts access only active threads with non-revoked invitations.
- **Deliberation Lifecycle Governance**:
  - `POST /api/projects/:id/creation-thread/invite-expert`: Product Lead invites an employee, recording an immutable `SME_EXPERT_INVITED` event in `AuditLog` and dispatching a notification.
  - `POST /api/projects/:id/creation-thread/revoke-expert`: Revokes SME consultation privileges immediately (`SME_EXPERT_REVOKED`).
  - `POST /api/projects/:id/creation-thread/finalize`: Finalizes and locks deliberation thread, automatically stamping `revoked_at` across all active SME consultations as the project transitions to execution.
  - Automatic status hook: Transitioning project to `active` or `completed` automatically triggers `finalizeCreationThreadHelper`.
- **Contributor Workspace Integration**:
  - Dedicated "Active SME Consultations" card on Developer Dashboard (`/employee/dashboard`) displaying active consultation requests with one-click direct links to join the deliberation.
  - Interactive Creation Deliberation GUI on Project Detail view (`/pm/projects/$projectId`) with role-badged message streams, live SME chips, and SME invite modal.

### 11. 💬 Employee-to-Employee Project Collaboration Chat & Direct Messaging (Phase 10)
- **Team Collaboration Channel (`server/models/TeamChannel.js`)**:
  - One auto-created channel per project upon launch or creation.
  - Multi-threaded discussion model (`threads: [{ topic, created_by, messages, linked_task_id, flagged_for_review, ... }]`).
- **Visibility-Scoped Access Control (`server/lib/chatVisibility.js`)**:
  - Pure zero-DB logic engine enforcing role-based data tiers:
    - **General Threads** (no `linked_task_id`): Any project member can view and contribute.
    - **`full` Visibility Tier**: Full access across all threads (automatic for Product Leads and Lead Architects).
    - **`own_data_only` Visibility Tier**: Restricted exclusively to threads linked to tasks directly assigned to the employee.
    - **`own_plus_dependency` Visibility Tier**: Access granted to assigned tasks plus immediate prerequisite/dependent tasks in the DAG.
- **PM Agent Passive Monitoring Engine (`server/lib/threadMonitor.js` & `server/jobs/threadMonitor.js`)**:
  - **Task Reference & Blocker Detection**: Automatically analyzes thread content for mentions of scheduled project tasks and dependency phrases (e.g., `"blocked on"`, `"waiting for"`).
  - **Unresolved Disagreement Detection**: AI-assisted background monitor detecting stalled debates ($\ge 24$ hours without consensus), automatically flagging threads with a structured dispute reason and suggested resolution.
  - Periodic cron runner (`initThreadMonitorCron`) dispatches high-priority `unresolved_disagreement` notifications to the Product Lead and logs an immutable `AuditLog` entry.
- **1-on-1 Project-Scoped Direct Messaging (`server/models/DirectMessage.js`)**:
  - Encrypted, strictly project-scoped direct messaging between allocated team members.
  - Indexed by `{ project_id, participant_ids }` (sorted for deterministic lookups).
  - Built-in read receipts (`read_at`), active peer status, and 1-click DM launch directly from project member chips.
- **Permanent Archival Guarantee**:
  - Zero `DELETE` endpoints exist for channels, threads, or messages, strictly preserving full institutional discussion history for post-mortems and audits.

### 12. 🏁 Formal Project Completion & Retrospective Protocol (Phase 11)
- **Rigorous Completion Preconditions**:
  - `POST /api/projects/:id/complete` enforces that all scheduled tasks must be in `completed` status before final sign-off. Incomplete tasks block completion with HTTP 400 and a full enumerated list of unfinished work.
  - Project status transitions to `completed` with timestamped `completed_at` recording and append-only `AuditLog` entry.
- **Pure Logic Retrospective Engine (`server/lib/retrospectiveCalculator.js`)**:
  - **Estimation Accuracy Metrics**: Overall project variance percentage, employee-level variance tracking, and domain-level accuracy breakdowns across DynamicRole domains (Backend, Frontend, QA, Architecture, Design).
  - **Comprehensive Incident Telemetry**: Zero-default aggregation of unresolved 3-day partial work streaks, QA rejection loops, contested appeals, and directive changes.
  - **Team Reliability & Quality Ledger**: On-time task delivery reliability percentages and first-pass Definition-of-Done approval quality rates calculated per contributor.
- **AI-Synthesized Lessons Learned (`server/lib/lessonsGenerator.js`)**:
  - Google Gemini AI synthesizes root causes, structural challenges, and estimation calibration recommendations into structured takeaway bullets, backed by graceful fallback on quota or network failure.
- **Strict Retrospective Immutability (`server/models/Retrospective.js`)**:
  - Once generated, Retrospectives are locked (`locked: true`). Zero `PUT` or `PATCH` routes exist on the retrospective endpoint (HTTP 404), ensuring post-mortem audit integrity.
  - Role-based confidentiality: Hourly rates and financial cost figures are strictly scrubbed from retrospective views for non-Product Lead team members.
- **Portfolio & Project Lifecycle Integration**:
  - Executive Portfolio dashboard (`/pm/portfolio`) includes tabbed status filters (`ALL`, `Active`, `Completed`, `Frozen`, `Archived`) with visually distinct completion badges.
  - Interactive Retrospective Dashboard embedded directly into the completed project view (`/pm/projects/$projectId`), featuring 4-card incident metrics, estimation variance tables, success metrics scorecard, AI lessons learned, and team performance telemetry.

### 13. 📅 Interactive Calendar Matrix GUI
- **Day-by-Day Contributor Matrix**: Interactive grid showing real-time contributor status (`Completed`, `In Progress`, `Blocked`, `No Log`).
- **Instant Log Inspector Modal**: Click any log cell to inspect submitted deliverables, actual hours spent, blocker descriptions, and PR links.

### 14. 👥 Employee 360 & Workload Capacity Engine
- **Capacity Gauge**: Visual circular gauge displaying real-time allocation percentage across all active projects.
- **Multi-Project Team Allocation**: Add and remove contributors from projects with automatic role matching.
- **High-Priority Project Guardrail**: Mark critical initiatives as **High Priority** so developers with multiple commitments know where to focus first.
- **1-Click Dossier Export**: Generate and print clean executive performance dossiers.

### 15. 🧠 5-Dimension AI Summary & Copilot Hub
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
│   │   ├── collaboration.js        # Project team channel, threads & 1-on-1 DMs
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
│   │   ├── pm.capacity.tsx         # Global Capacity Registry & Utilization Ledger
│   │   ├── pm.reviews.tsx          # QA Gate Sign-Off & Contested Appeals Queue
│   │   ├── pm.roles.tsx            # Dynamic Role & Evaluation Mode Governance
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
| `POST` | `/api/tasks` | Create deliverable with priority flag & dependencies |
| `POST` | `/api/submissions` | Submit deliverable for QA DoD gate evaluation (AI/Subjective) |
| `GET` | `/api/submissions/pending-review` | List deliverables awaiting Lead/Architect human sign-off |
| `POST` | `/api/submissions/:id/human-review` | Approve or request changes on deliverable (with AuditLog) |
| `POST` | `/api/appeals` | Contest rejected deliverable with justification (employee only) |
| `GET` | `/api/appeals/pending` | List pending appeals awaiting adjudication |
| `POST` | `/api/appeals/:id/resolve` | Resolve appeal (override/upheld) with AuditLog and status flip |
| `GET` | `/api/slippage/escalations` | List active unresolved slippage & rejection escalations for PM |
| `GET` | `/api/slippage/project/:projectId` | List unresolved slippage events for a specific project |
| `GET` | `/api/slippage/employee/:userId` | Get employee's slippage history (self or Lead/Architect) |
| `POST` | `/api/slippage/:id/resolve` | Resolve slippage escalation with chosen remediation option |
| `POST` | `/api/internal/run-slippage-check` | Trigger automated slippage detection check (cron or manual) |
| `POST` | `/api/actions/reorder` | Reorder task position with DAG prerequisite cycle/dependency validation |
| `POST` | `/api/actions/swap` | Swap task to another day this week under 40h workload cap |
| `POST` | `/api/actions/postpone` | Postpone task (strictly blocked with 403 per governance rules) |
| `POST` | `/api/actions/request-clarification` | Request task requirements clarification & pause 3-day slippage clock |
| `GET` | `/api/actions/clarifications/pending` | List open clarification requests awaiting Product Lead answer |
| `POST` | `/api/actions/clarifications/:id/answer` | Answer clarification, unfreeze task slippage timer, record AuditLog |
| `POST` | `/api/tasks/:id/subtasks` | Create sub-task with optional acceptance criteria override |
| `GET` | `/api/tasks/:id/subtasks` | List child sub-tasks with computed progress rollup |
| `GET` | `/api/tasks/:id/progress` | Get granular task completion progress percentage |
| `POST` | `/api/tasks/project/:id/recalculate-priorities` | Recalculate CPM longest-path slack & blocker priorities (P0/P1/P2) |
| `GET` | `/api/portfolio/dashboard` | Executive portfolio view with health indicators & pending actions (budget for Product Lead) |
| `GET` | `/api/portfolio/utilization-heatmap` | Global workforce utilization heatmap across all active projects |
| `GET` | `/api/projects/:id/budget` | Full budget burn detail & velocity projection (Product Lead only) |
| `PATCH` | `/api/users/:id/cost-rate` | Update employee hourly cost rate with immutable AuditLog (Product Lead only) |
| `PATCH` | `/api/projects/:id/success-metrics` | Define/update project target success metrics (Product Lead only) |
| `POST` | `/api/projects/:id/complete` | Complete project, verify all tasks done, lock Retrospective (Product Lead only) |
| `GET` | `/api/projects/:id/retrospective` | View immutable project retrospective (cost-scrubbed for non-leads) |
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
