export type UtilizationBand = "Optimal" | "High Focus" | "Max Cap" | "Balanced" | "Available" | "Over Cap";

export type Role = {
  id: string;
  title: string;
  domain: string;
  description: string;
  skills: string[];
  dailyCap: number;
};

export type Employee = {
  id: string;
  name: string;
  initials: string;
  roleId: string;
  timezone: string;
  dailyCap: number;
  crossProjectHours: number;
  reliability: number;
  firstPass: number;
  status: "Active" | "On Leave";
};

export type Allocation = {
  employeeId: string;
  roleId: string;
  dailyAllocated: number;
  projectTotal: number;
  visibility: "Full Data" | "Own Data Only" | "Own + Dependencies";
};

export type Phase = {
  id: string;
  name: string;
  lead: string;
  startWeek: number;
  endWeek: number;
  milestone: string;
  progress: number;
};

export type Project = {
  id: string;
  title: string;
  intent: string;
  state: "Active" | "Awaiting Approval" | "Frozen" | "Archived";
  prdVersion: string;
  health: "On Track" | "At Risk" | "Blocked";
  startedOn: string;
  targetDate: string;
  weeks: number;
  allocations: Allocation[];
  phases: Phase[];
};

export const roles: Role[] = [
  {
    id: "r-arch",
    title: "Lead Solutions Architect",
    domain: "Engineering",
    description:
      "Defines high-level system architecture, distributed services, database schemas, and API contracts.",
    skills: ["System Design", "Cloud", "Scalability"],
    dailyCap: 6,
  },
  {
    id: "r-be",
    title: "Senior Backend Engineer",
    domain: "Engineering",
    description:
      "Develops robust backend microservices, async worker queues, data pipelines, and third-party integrations.",
    skills: ["Python", "PostgreSQL", "FastAPI", "Celery"],
    dailyCap: 7,
  },
  {
    id: "r-fs",
    title: "Fullstack Developer",
    domain: "Engineering",
    description: "Bridges API and interface work, owns feature verticals end to end.",
    skills: ["TypeScript", "React", "Node", "SQL"],
    dailyCap: 6.5,
  },
  {
    id: "r-ux",
    title: "UI/UX Design Specialist",
    domain: "Design",
    description:
      "Creates responsive web interfaces, user journey flows, design tokens, and interactive prototypes.",
    skills: ["Figma", "Wireframing", "Design Systems"],
    dailyCap: 6,
  },
  {
    id: "r-copy",
    title: "Growth Copywriter",
    domain: "Marketing",
    description:
      "Writes high-converting landing page copy, value proposition hooks, and A/B ad variations.",
    skills: ["Copywriting", "Conversion Optimization"],
    dailyCap: 5.5,
  },
  {
    id: "r-qa",
    title: "QA & Test Automation Lead",
    domain: "Quality",
    description:
      "Authors automated end-to-end suites, load tests, and validates PRs against PRD acceptance criteria.",
    skills: ["PyTest", "Playwright", "CI/CD", "Load Testing"],
    dailyCap: 6,
  },
];

export const employees: Employee[] = [
  { id: "e-david", name: "David Miller", initials: "DM", roleId: "r-arch", timezone: "Asia/Kolkata", dailyCap: 6, crossProjectHours: 1.5, reliability: 96, firstPass: 91, status: "Active" },
  { id: "e-sarah", name: "Sarah Chen", initials: "SC", roleId: "r-be", timezone: "Europe/Berlin", dailyCap: 7, crossProjectHours: 1.0, reliability: 93, firstPass: 88, status: "Active" },
  { id: "e-alex", name: "Alex Rivera", initials: "AR", roleId: "r-fs", timezone: "America/New_York", dailyCap: 6.5, crossProjectHours: 0, reliability: 78, firstPass: 72, status: "Active" },
  { id: "e-elena", name: "Elena Rostova", initials: "ER", roleId: "r-ux", timezone: "America/Los_Angeles", dailyCap: 6, crossProjectHours: 0.5, reliability: 97, firstPass: 95, status: "Active" },
  { id: "e-marcus", name: "Marcus Vance", initials: "MV", roleId: "r-qa", timezone: "Europe/London", dailyCap: 6, crossProjectHours: 0, reliability: 90, firstPass: 84, status: "On Leave" },
  { id: "e-priya", name: "Priya Nair", initials: "PN", roleId: "r-copy", timezone: "Asia/Kolkata", dailyCap: 5.5, crossProjectHours: 2.0, reliability: 88, firstPass: 90, status: "Active" },
];

export const projects: Project[] = [
  {
    id: "notification-engine",
    title: "Enterprise Real-Time Notification Engine",
    intent:
      "Deliver a multi-channel, at-least-once notification pipeline for 4M enterprise end users with per-tenant rate limiting, template governance and delivery analytics.",
    state: "Active",
    prdVersion: "v2.1",
    health: "At Risk",
    startedOn: "2026-07-06",
    targetDate: "2026-09-04",
    weeks: 8,
    allocations: [
      { employeeId: "e-david", roleId: "r-arch", dailyAllocated: 4, projectTotal: 120, visibility: "Full Data" },
      { employeeId: "e-sarah", roleId: "r-be", dailyAllocated: 6, projectTotal: 210, visibility: "Full Data" },
      { employeeId: "e-alex", roleId: "r-fs", dailyAllocated: 6, projectTotal: 190, visibility: "Own + Dependencies" },
      { employeeId: "e-elena", roleId: "r-ux", dailyAllocated: 5, projectTotal: 160, visibility: "Own + Dependencies" },
      { employeeId: "e-marcus", roleId: "r-qa", dailyAllocated: 4.5, projectTotal: 135, visibility: "Own Data Only" },
    ],
    phases: [
      { id: "p1", name: "Architecture & DB Setup", lead: "David M. / Sarah C.", startWeek: 1, endWeek: 2, milestone: "Core Schema & API Ready", progress: 100 },
      { id: "p2", name: "Core Business Logic", lead: "Sarah C. / Alex R.", startWeek: 2, endWeek: 5, milestone: "Services & Logic Functional", progress: 64 },
      { id: "p3", name: "Frontend Dashboard & UI", lead: "Elena R. / Alex R.", startWeek: 4, endWeek: 7, milestone: "Interactive UI Connected", progress: 22 },
      { id: "p4", name: "QA, Testing & Hardening", lead: "Marcus V. / All", startWeek: 6, endWeek: 8, milestone: "100% Test Pass & Launch", progress: 0 },
    ],
  },
  {
    id: "support-automation",
    title: "Omni-Channel Support Automation",
    intent:
      "Automate tier-1 support triage across email, chat and voice with deflection analytics and human handoff SLAs.",
    state: "Active",
    prdVersion: "v1.3",
    health: "Blocked",
    startedOn: "2026-07-27",
    targetDate: "2026-10-02",
    weeks: 9,
    allocations: [
      { employeeId: "e-alex", roleId: "r-fs", dailyAllocated: 2, projectTotal: 88, visibility: "Own Data Only" },
      { employeeId: "e-priya", roleId: "r-copy", dailyAllocated: 3.5, projectTotal: 120, visibility: "Own Data Only" },
      { employeeId: "e-david", roleId: "r-arch", dailyAllocated: 1.5, projectTotal: 60, visibility: "Full Data" },
    ],
    phases: [
      { id: "p1", name: "Intent Model & Taxonomy", lead: "David M.", startWeek: 1, endWeek: 3, milestone: "Taxonomy Signed Off", progress: 80 },
      { id: "p2", name: "Deflection Copy & Flows", lead: "Priya N.", startWeek: 2, endWeek: 5, milestone: "Copy Library v1", progress: 45 },
      { id: "p3", name: "Agent Console", lead: "Alex R.", startWeek: 4, endWeek: 8, milestone: "Console Beta", progress: 10 },
    ],
  },
  {
    id: "billing-migration",
    title: "Usage-Based Billing Migration",
    intent:
      "Migrate legacy seat billing to metered usage with proration, dunning and revenue recognition exports.",
    state: "Awaiting Approval",
    prdVersion: "v0.9 draft",
    health: "On Track",
    startedOn: "2026-08-24",
    targetDate: "2026-11-13",
    weeks: 11,
    allocations: [
      { employeeId: "e-sarah", roleId: "r-be", dailyAllocated: 1, projectTotal: 55, visibility: "Full Data" },
      { employeeId: "e-elena", roleId: "r-ux", dailyAllocated: 0.5, projectTotal: 24, visibility: "Own Data Only" },
    ],
    phases: [
      { id: "p1", name: "Metering Contracts", lead: "Sarah C.", startWeek: 1, endWeek: 4, milestone: "Event Schema Frozen", progress: 0 },
      { id: "p2", name: "Invoice Surfaces", lead: "Elena R.", startWeek: 3, endWeek: 7, milestone: "Invoice UX Approved", progress: 0 },
    ],
  },
];

export const utilizationBand = (pct: number): UtilizationBand => {
  if (pct > 100) return "Over Cap";
  if (pct >= 90) return "Max Cap";
  if (pct >= 80) return "High Focus";
  if (pct >= 70) return "Balanced";
  if (pct >= 55) return "Optimal";
  return "Available";
};

export const getRole = (id: string) => roles.find((r) => r.id === id)!;
export const getEmployee = (id: string) => employees.find((e) => e.id === id)!;
export const getProject = (id: string) => projects.find((p) => p.id === id);

export const globalLedger = employees.map((e) => {
  const inProject = projects
    .filter((p) => p.state === "Active" || p.state === "Awaiting Approval")
    .flatMap((p) =>
      p.allocations
        .filter((a) => a.employeeId === e.id)
        .map((a) => ({ project: p.title, projectId: p.id, hours: a.dailyAllocated, state: p.state })),
    );
  const allocated = inProject.reduce((s, a) => s + a.hours, 0) + e.crossProjectHours;
  return {
    employee: e,
    lines: inProject,
    allocated,
    pct: Math.round((allocated / e.dailyCap) * 1000) / 10,
  };
});

export type Alert = {
  id: string;
  tier: "Level 2: CEO High Escalation" | "Level 1: Internal Warning" | "Level 0: Normal Tracking";
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  projectId: string;
  options: string[];
  age: string;
};

export const alerts: Alert[] = [
  {
    id: "a1",
    tier: "Level 2: CEO High Escalation",
    severity: "critical",
    title: "3-day slippage circuit breaker — Alex Rivera",
    body: "Partial work submitted and remaining tasks postponed for 3 consecutive days on Omni-Channel Support Automation. Cumulative slippage: 6.5 hours. Downstream impact: UI Integration delayed by 2 days.",
    projectId: "support-automation",
    options: ["Reassign overflow to Sarah Chen", "Schedule 1-on-1 check-in", "Extend milestone timeline"],
    age: "12 min ago",
  },
  {
    id: "a2",
    tier: "Level 2: CEO High Escalation",
    severity: "critical",
    title: "Capacity collision — Priya Nair at 118% of daily cap",
    body: "Adding 3.5 hrs/day on Omni-Channel Support Automation exceeds the 5.5 hr/day ceiling by 1.0 hour against existing cross-project commitments.",
    projectId: "support-automation",
    options: ["Reduce allocation to 2.5 hrs/day", "Remove from other initiative", "CEO cap override"],
    age: "48 min ago",
  },
  {
    id: "a3",
    tier: "Level 1: Internal Warning",
    severity: "warning",
    title: "Estimation drift — API Rate Limiter at 200% of estimate",
    body: "Estimated 8 hours, 16 hours logged, employee reports 60% complete. Projected actual total 26 hours (+18 hrs). Milestone 2 delayed by 3 days.",
    projectId: "notification-engine",
    options: ["Accept revised estimate", "Reassign remaining work", "Reduce task scope"],
    age: "3 hrs ago",
  },
  {
    id: "a4",
    tier: "Level 1: Internal Warning",
    severity: "warning",
    title: "Appeal pending adjudication — Sarah Chen",
    body: "Submission rejected for 'missing error handling'. Employee counter-argument: handled via global middleware pattern in error_handler.py. Awaiting human override decision.",
    projectId: "notification-engine",
    options: ["Uphold rejection", "Override as complete", "Route to Tech Lead"],
    age: "5 hrs ago",
  },
  {
    id: "a5",
    tier: "Level 0: Normal Tracking",
    severity: "info",
    title: "Leave auto-rebalancer armed — Marcus Vance (2 days sick leave)",
    body: "Slippage counter suppressed. 9.0 QA hours on the critical path require redistribution before Wk 6 hardening gate.",
    projectId: "notification-engine",
    options: ["Redistribute to Alex Rivera", "Shift hardening gate by 2 days", "Hold — no action"],
    age: "1 day ago",
  },
];

export type PrdSection = { heading: string; body: string; bullets?: string[] };

export const prd: Record<string, PrdSection[]> = {
  "notification-engine": [
    {
      heading: "Executive Problem Summary",
      body: "Tenants have no reliable way to reach their end users across channels. Fragmented per-service senders produce duplicate sends, no delivery visibility and no per-tenant throttling — driving support load and churn risk in the enterprise tier.",
      bullets: [
        "Primary personas: Tenant Ops Admin, Platform SRE, Enterprise End User",
        "Target outcome: 99.95% delivery success, p95 dispatch under 900ms",
        "ROI: retires 3 bespoke senders, ~$310K/yr in maintenance and vendor spend",
      ],
    },
    {
      heading: "Scope & Guardrails",
      body: "In-scope and out-of-scope boundaries are frozen at v2.1 and require a consequence-accepted change request to alter.",
      bullets: [
        "IN: email, in-app, webhook channels; template registry; per-tenant rate limits; delivery analytics",
        "IN: at-least-once delivery with idempotency keys and dead-letter replay",
        "OUT: SMS and push channels (deferred to v3 roadmap)",
        "OUT: end-user preference center UI (owned by Account Settings squad)",
      ],
    },
    {
      heading: "Behavioral User Stories",
      body: "Every story carries Given-When-Then acceptance criteria enforced at the Definition of Done gate.",
      bullets: [
        "GIVEN a tenant at its hourly quota WHEN a dispatch is requested THEN the event is queued and a 429-equivalent quota signal is emitted, never dropped",
        "GIVEN a downstream provider outage WHEN 3 consecutive sends fail THEN the circuit opens and events route to the dead-letter stream with replay eligibility",
        "GIVEN a duplicate idempotency key within 24h WHEN dispatch is requested THEN the original receipt is returned and no second send occurs",
      ],
    },
    {
      heading: "Technical Architecture",
      body: "Event-driven microservices on PostgreSQL 16 with Redis Streams broker, selected by the executive option matrix during deliberation.",
      bullets: [
        "Dispatch API (FastAPI) → Redis Streams → channel workers (Celery)",
        "Template registry with semantic versioning and render-time validation",
        "Token-bucket rate limiter per tenant, per channel, evaluated at the edge",
        "Delivery telemetry to columnar store, 90-day hot retention",
      ],
    },
    {
      heading: "Team Composition Matrix",
      body: "Personnel matched from the directory using dynamic role descriptions and skill-tag semantics; allocations validated against the Global Capacity Ledger.",
    },
  ],
};

export const changelog = [
  { version: "v2.1", date: "2026-08-19", summary: "Dead-letter replay window extended to 7 days; QA hardening gate re-baselined +2 days.", consequence: "+12 engineering hours, no release date change", author: "Product Manager" },
  { version: "v2.0", date: "2026-08-04", summary: "Stripe-metered billing hooks removed from scope after consequence disclosure.", consequence: "-45 engineering hours, release pulled forward 6 days", author: "Product Manager" },
  { version: "v1.4", date: "2026-07-21", summary: "Rate limiter moved from service layer to edge; added token-bucket contract.", consequence: "+18 engineering hours, Backend Lead utilization 85.7%", author: "Product Manager" },
  { version: "v1.0", date: "2026-07-06", summary: "Initial PRD approved and workspace locked into active execution.", consequence: "Baseline: 815 total hours across 5 contributors", author: "Product Manager" },
];

export const directives = [
  {
    id: "d1",
    status: "Conflict — awaiting resolution",
    a: { when: "Mon 04 Aug", text: "Prioritize speed, cut QA to 1 day.", tag: "quality_priority: LOW" },
    b: { when: "Wed 19 Aug", text: "Quality is critical, add comprehensive load testing.", tag: "quality_priority: HIGH" },
  },
];

export type TaskItem = {
  id: string;
  title: string;
  estimate: number;
  logged: number;
  state: "Queued" | "In Progress" | "Submitted" | "Rejected" | "Blocked" | "Done";
  dependsOn?: string;
  blocks?: string;
  criteria: string[];
};

export const employeeQueue: TaskItem[] = [
  {
    id: "t-1",
    title: "Token-bucket rate limiter — per-tenant edge evaluation",
    estimate: 8,
    logged: 16,
    state: "In Progress",
    blocks: "Elena — quota banner UI",
    criteria: [
      "GIVEN quota exhausted WHEN dispatch requested THEN quota signal emitted, event queued",
      "Unit + load test coverage above 85% on limiter module",
    ],
  },
  {
    id: "t-2",
    title: "Dead-letter replay endpoint with idempotency guard",
    estimate: 5,
    logged: 0,
    state: "Blocked",
    dependsOn: "David — replay contract sign-off",
    criteria: ["Replay is idempotent across 7-day window", "Audit row written per replay attempt"],
  },
  {
    id: "t-3",
    title: "Webhook channel worker — retry with circuit breaker",
    estimate: 6,
    logged: 6,
    state: "Submitted",
    criteria: ["Circuit opens after 3 consecutive failures", "PR link + test log attached"],
  },
  {
    id: "t-4",
    title: "Delivery telemetry schema migration",
    estimate: 3,
    logged: 3,
    state: "Rejected",
    criteria: ["Backfill script is reversible", "Error handling on partial batch failure"],
  },
  {
    id: "t-5",
    title: "Template render-time validation hardening",
    estimate: 4,
    logged: 0,
    state: "Queued",
    criteria: ["Invalid token surfaces field-level error", "No panic on malformed payload"],
  },
];

export const edgeCases = [
  { n: 1, level: "Critical", name: "Multi-Project Employee Capacity Collision", solution: "Global Cross-Project Capacity Registry with pre-allocation validation gate.", surface: "/capacity" },
  { n: 2, level: "Critical", name: "Employee Disputes Agent Rejection", solution: "Structured appeal button with human adjudication panel and permanent audit trail.", surface: "/workspace" },
  { n: 3, level: "Critical", name: "Mid-Project Employee Departure", solution: "Emergency offboarding: orphaned-work audit, skill-matched successor ranking, transfer brief.", surface: "/directory" },
  { n: 4, level: "Critical", name: "Mid-Project Onboarding", solution: "Mid-sprint contextual onboarding engine with auto-generated context brief and DAG-safe ramp-up.", surface: "/directory" },
  { n: 5, level: "Critical", name: "Executive Sponsor Inactivity", solution: "Tiered escalation: 6h priority badge, 24h summary digest, 48h delegate authority activation.", surface: "/governance" },
  { n: 6, level: "Important", name: "Circular Dependency Deadlock", solution: "Topological cycle detection on every edge insertion with minimal-impact break recommendation.", surface: "/governance" },
  { n: 7, level: "Important", name: "Estimation Drift", solution: "50% overrun variance tracker with downstream impact projection and calibration profiles.", surface: "/governance" },
  { n: 8, level: "Important", name: "Project Freeze or Cancellation", solution: "Lifecycle state machine: queue cleanup, capacity release, resumable read-only snapshot.", surface: "/governance" },
  { n: 9, level: "Important", name: "Contradictory Directives", solution: "Semantic conflict detection with explicit precedence prompt and audit-grade resolution log.", surface: "/governance" },
  { n: 10, level: "Important", name: "Artifact Storage Governance", solution: "Role-bound file types, 100MB per-file cap, 90-day cold storage migration, storage analytics.", surface: "/governance" },
  { n: 11, level: "Polish", name: "Timezone Coordination", solution: "Per-employee timezone, 9AM local queue delivery, dependency handoff window calculation.", surface: "/governance" },
  { n: 12, level: "Polish", name: "Notification Fatigue", solution: "Three-tier classification with smart batching and per-user delivery preferences.", surface: "/governance" },
  { n: 13, level: "Polish", name: "Template Project Cloning", solution: "Template library with capture-on-completion, one-click clone and independent versioning.", surface: "/templates" },
];

export const templates = [
  { id: "tpl-1", name: "Enterprise Platform Build", version: "v3.2", roles: 5, phases: 4, weeks: 8, uses: 6, note: "Architecture-first delivery with hardening gate." },
  { id: "tpl-2", name: "Monthly Growth Campaign", version: "v1.7", roles: 3, phases: 3, weeks: 4, uses: 14, note: "Copy, creative and landing experiments." },
  { id: "tpl-3", name: "Quarterly Compliance Audit", version: "v2.0", roles: 4, phases: 5, weeks: 6, uses: 4, note: "Evidence collection, gap closure, sign-off." },
  { id: "tpl-4", name: "Client Onboarding Playbook", version: "v4.1", roles: 4, phases: 4, weeks: 3, uses: 22, note: "Kickoff, data migration, training, handover." },
];

export const permissionMatrix = [
  { capability: "Create / archive projects", pm: "Full unilateral", lead: "Restricted", contributor: "No access" },
  { capability: "Configure Gantt visibility", pm: "Sovereign authority", lead: "Assigned view", contributor: "Assigned view" },
  { capability: "Create / modify dynamic roles", pm: "Sovereign authority", lead: "View only", contributor: "View only" },
  { capability: "Approve final PRDs & budgets", pm: "Sole authority", lead: "No access", contributor: "No access" },
  { capability: "Authorize scope / timeline change", pm: "Consequence acceptance", lead: "No access", contributor: "No access" },
  { capability: "In-project strategy chat", pm: "Unrestricted", lead: "Project context", contributor: "Task context" },
  { capability: "Submit daily work & hours", pm: "Oversight only", lead: "Direct submission", contributor: "Direct submission" },
  { capability: "Minor schedule task swaps", pm: "Full override", lead: "Full approval", contributor: "Self-reorder only" },
  { capability: "Appeal agent rejection", pm: "Final override", lead: "Can appeal", contributor: "Can appeal" },
  { capability: "Manage leave & absence", pm: "Full authority", lead: "Self & team view", contributor: "Self-declaration" },
  { capability: "View 3-day slippage alerts", pm: "Instant priority push", lead: "Team summary", contributor: "Personal only" },
];
