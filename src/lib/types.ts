import { cn } from "@/lib/utils";

export { cn };

// Re-export ProjectPriority & TaskPriority from constants as the canonical type
export type { ProjectPriority, TaskPriority, EvaluationMode, SubmissionStatus, AppealStatus } from "@/lib/constants";
export type UserType = "product_lead" | "lead_architect" | "employee" | "pm";
export type ProjectStatus = "active" | "in-review" | "completed" | "frozen" | "archived";

export interface DynamicRole {
  id: string;
  _id?: string;
  title: string;
  domain: string;
  description: string;
  skillTags: string[];
  defaultDailyCapHours: number;
  evaluationMode?: import("@/lib/constants").EvaluationMode;
  createdBy?: string;
  orgScoped?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TeamAllocation {
  user_id: string;
  role_id?: string;
  daily_hours?: number;
  allocated_at?: string;
}

export interface UserProfile {
  id: string;
  _id?: string;
  email: string;
  full_name: string;
  role_title: string;
  user_type: UserType;
  status: "active" | "inactive";
  photo_url?: string;
  totalProjectsAssigned?: number;
  projectCount?: number;
  activeTasksCount?: number;
  activeTasksInThisProject?: number;
  dynamicRole?: DynamicRole | null;
  allocatedDailyHours?: number;
  defaultDailyCapHours?: number;
  hourly_cost_rate?: number;
  assignedProjects?: Array<{ _id: string; title: string; status: string; priority: import("@/lib/constants").ProjectPriority }>;
  created_at: string;
}

export interface Project {
  id: string;
  _id?: string;
  title: string;
  description: string;
  created_by: string;
  status: ProjectStatus;
  priority: import("@/lib/constants").ProjectPriority;
  member_ids: string[];
  team_allocations?: TeamAllocation[];
  members?: UserProfile[];
  success_metrics?: Array<{ description: string; target: string }>;
  completed_at?: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  _id?: string;
  project_id: string;
  parent_task_id?: string | null;
  is_subtask?: boolean;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  assignee_ids: string[];
  status: "active" | "completed";
  depends_on?: string[] | Array<{ _id: string; title: string; status?: string }>;
  estimate_hours?: number;
  logged_hours?: number;
  order_index?: number;
  slippage_frozen?: boolean;
  acceptance_criteria_override?: string | null;
  computed_priority?: import("@/lib/constants").TaskPriority;
  priority_reasoning?: string;
  subtask_count?: number;
  subtask_completed?: number;
  subtask_progress?: number;
  clarifications?: Array<{
    _id?: string;
    id?: string;
    question: string;
    answer?: string;
    answered_by?: string | UserProfile;
    answered_at?: string;
    created_at?: string;
  }>;
  created_at: string;
}

export interface TaskProgressResponse {
  taskId: string;
  totalSubtasks: number;
  completedSubtasks: number;
  progressPct: number;
  is_subtask: boolean;
  parent_task_id: string | null;
}

export interface DailyLog {
  id: string;
  _id?: string;
  task_id: string;
  user_id: string;
  log_date: string;
  work_text: string;
  has_worked: boolean;
  no_work_reason: string;
  created_at: string;
}

// ─── Phase 3: Capacity Registry Types ────────────────────────────────────────

export interface CapacityAllocationEntry {
  projectId: string;
  projectTitle: string;
  priority: import("@/lib/constants").ProjectPriority;
  dailyHours: number;
}

export interface EmployeeCapacity {
  userId: string;
  name?: string;
  email?: string;
  totalDailyHours: number;
  dailyCap: number;
  utilizationPct: number;
  isOverAllocated: boolean;
  projects: CapacityAllocationEntry[];
}

export interface CapacityConflict {
  hasConflict: true;
  currentTotal: number;
  dailyCap: number;
  overflowHours: number;
  conflictingProjects: CapacityAllocationEntry[];
  resolutionSuggestion: CapacityResolutionSuggestion;
}

export interface CapacityOk {
  hasConflict: false;
}

export type CapacityCheckResult = CapacityConflict | CapacityOk;

export interface CapacityResolutionSuggestion {
  resolvable: boolean;
  reason?: string;
  reductions: Array<{
    projectId: string;
    projectTitle: string;
    currentHours: number;
    suggestedHours: number;
    reduceBy: number;
    priority: import("@/lib/constants").ProjectPriority;
  }>;
}

// ─── Phase 4: QA Gate & Appeal Types ──────────────────────────────────────────

export interface Submission {
  id: string;
  _id?: string;
  task_id: string | Task;
  employee_id: string | UserProfile;
  artifact_url: string;
  artifact_type: "pr_link" | "figma_link" | "file" | "text";
  status: import("@/lib/constants").SubmissionStatus;
  evaluation_mode: import("@/lib/constants").EvaluationMode;
  ai_verdict?: {
    passed: boolean | null;
    missing_items: string[];
    reasoning: string;
  };
  rejection_count: number;
  reviewed_by?: string | UserProfile | null;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Appeal {
  id: string;
  _id?: string;
  submission_id: string | Submission;
  employee_id: string | UserProfile;
  justification: string;
  status: import("@/lib/constants").AppealStatus;
  reviewer_id?: string | UserProfile | null;
  reviewer_notes?: string;
  resolved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Phase 5: Slippage & Rejection Loop Types ─────────────────────────────────

export interface SlippageEvent {
  id: string;
  _id?: string;
  user_id: string | UserProfile;
  project_id: string | Project;
  trigger_type: import("@/lib/constants").SlippageTriggerType;
  day_count?: number;
  rejection_count?: number;
  task_id?: string | Task;
  level: import("@/lib/constants").SlippageLevel;
  cumulative_slippage_hours: number;
  downstream_impact: string;
  resolution_options_presented: string[];
  resolved: boolean;
  resolved_by?: string | UserProfile;
  resolution_chosen?: string;
  resolved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─── Phase 6: Employee Action Request Types ───────────────────────────────────

export interface ActionRequest {
  id: string;
  _id?: string;
  employee_id: string | UserProfile;
  task_id: string | Task;
  project_id: string | Project;
  action_type: import("@/lib/constants").ActionType;
  status: import("@/lib/constants").ActionStatus;
  payload?: any;
  decision_reasoning: string;
  clarification_question?: string;
  clarification_answer?: string;
  answered_by?: string | UserProfile;
  slippage_frozen?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Phase 8: Portfolio & Cost Tracking Types ─────────────────────────────────

export interface ProjectHealth {
  health: import("@/lib/constants").ProjectHealthStatus;
  reasons: string[];
}

export interface BudgetBurnSnapshot {
  budgetedCost: number;
  actualCostBurned: number;
  remainingBudget: number;
  projectedFinalCost: number;
  burnPct: number;
  status: import("@/lib/constants").ProjectHealthStatus;
}

export interface PortfolioPendingActions {
  unresolvedSlippage: number;
  pendingAppeals: number;
  pendingClarifications: number;
  total: number;
}

export interface PortfolioProject {
  id: string;
  _id?: string;
  title: string;
  description: string;
  priority: import("@/lib/constants").ProjectPriority;
  status: import("@/lib/constants").ProjectStatus;
  totalTasks: number;
  completedTasks: number;
  pendingActions: PortfolioPendingActions;
  health: ProjectHealth;
  budget?: BudgetBurnSnapshot; // Only present for product_lead
}

export interface PortfolioSummary {
  unresolvedSlippage: number;
  pendingAppeals: number;
  pendingClarifications: number;
  totalPendingActions: number;
  totalProjects: number;
}

export interface PortfolioDashboardResponse {
  success: boolean;
  summary: PortfolioSummary;
  projects: PortfolioProject[];
}

export interface HeatmapProjectSegment {
  projectId: string;
  title: string;
  dailyHours: number;
  priority: import("@/lib/constants").ProjectPriority;
}

export interface UtilizationHeatmapItem {
  userId: string;
  name: string;
  role_title: string;
  projects: HeatmapProjectSegment[];
  totalDailyHours: number;
  dailyCap: number;
  utilizationPct: number;
  isOverAllocated: boolean;
}

export interface MemberBudgetBreakdown {
  userId: string;
  name: string;
  role_title: string;
  rate: number;
  hoursLogged: number;
  dailyHoursAllocated: number;
  costBurned: number;
}

export interface ProjectBudgetDetail {
  success: boolean;
  projectId: string;
  projectTitle: string;
  budgetedCost: number;
  actualCostBurned: number;
  remainingBudget: number;
  projectedFinalCost: number;
  burnPct: number;
  status: import("@/lib/constants").ProjectHealthStatus;
  totalEstimatedHours: number;
  totalHoursCompleted: number;
  teamAllocations: Array<{ userId: string; totalHours: number; rate: number; cost: number }>;
  memberBreakdown: MemberBudgetBreakdown[];
}

export interface CreationThreadMessage {
  id: string;
  _id?: string;
  author_id: string;
  author_name: string;
  author_role_title?: string;
  author_photo_url?: string;
  author_role_at_time: "product_lead" | "invited_expert" | "lead_architect";
  content: string;
  created_at: string;
}

export interface InvitedExpert {
  user_id: string;
  user_name?: string;
  user_role_title?: string;
  invited_by: string;
  invited_at: string;
  revoked_at?: string | null;
}

export interface CreationThread {
  id: string;
  _id?: string;
  project_id: string;
  project_title: string;
  title: string;
  description?: string;
  intent?: string;
  status: "active" | "finalized";
  messages: CreationThreadMessage[];
  invited_experts: InvitedExpert[];
  created_at: string;
  is_sme_view?: boolean;
}

export interface SMEInvitationItem {
  threadId: string;
  projectId: string;
  projectTitle: string;
  projectDescription: string;
  priority: import("@/lib/constants").ProjectPriority;
  invitedAt: string;
  status: "active" | "finalized";
}

// ─── Phase 10: Team Channel & Direct Messaging Types ─────────────────────────

export interface ChannelMessage {
  id: string;
  _id?: string;
  author_id: string;
  author_name: string;
  author_role_title?: string;
  author_photo_url?: string;
  content: string;
  created_at: string;
}

export interface ChannelThread {
  id: string;
  _id?: string;
  topic: string;
  created_by: string;
  creator_name?: string;
  creator_role_title?: string;
  creator_photo_url?: string;
  linked_task_id?: string | null;
  linked_task_title?: string | null;
  flagged_for_review?: boolean;
  flagged_reason?: string | null;
  suggested_resolution?: string | null;
  created_at: string;
  messages: ChannelMessage[];
}

export interface TeamChannel {
  id: string;
  _id?: string;
  project_id: string;
  project_title?: string;
  visibility_tier?: string;
  threads: ChannelThread[];
}

export interface DirectMessageItem {
  id: string;
  _id?: string;
  author_id: string;
  author_name?: string;
  author_role_title?: string;
  author_photo_url?: string;
  content: string;
  created_at: string;
  read_at?: string | null;
}

export interface DirectMessage {
  id: string;
  _id?: string;
  project_id: string;
  project_title?: string;
  participant_ids: string[];
  other_user: {
    id: string;
    full_name: string;
    role_title?: string;
    photo_url?: string;
  };
  messages: DirectMessageItem[];
}

// ─── Phase 11: Retrospective & Project Completion Types ───────────────────────

export interface RetrospectiveSuccessMetric {
  metricDescription: string;
  targetValue: string;
  actualValue?: string;
  achieved: boolean | null;
}

export interface RetrospectiveEstimationAccuracy {
  overall: {
    totalEstimatedHours: number;
    totalActualHours: number;
    variancePct: number;
  };
  byEmployee: Array<{
    userId: string;
    estimatedHours: number;
    actualHours: number;
    variancePct: number;
  }>;
  byPhase: Array<{
    phaseOrTaskGroup: string;
    estimatedHours: number;
    actualHours: number;
    variancePct: number;
  }>;
}

export interface RetrospectiveIncidentSummary {
  slippageEventsCount: number;
  qaRejectionLoopCount: number;
  scopeChangesCount: number;
  blockerIncidentsCount: number;
}

export interface RetrospectiveTeamPerformance {
  userId: string;
  onTimeReliabilityPct: number | null;
  firstPassQualityPct: number | null;
  tasksCompleted: number;
}

export interface Retrospective {
  id?: string;
  _id?: string;
  project_id: string;
  generated_at: string;
  estimation_accuracy: RetrospectiveEstimationAccuracy;
  incident_summary: RetrospectiveIncidentSummary;
  success_metrics: RetrospectiveSuccessMetric[];
  lessons_learned: string[];
  team_performance: RetrospectiveTeamPerformance[];
  locked: boolean;
}

export interface IncompleteTaskItem {
  id: string;
  title: string;
  status: string;
  assignee_ids: string[];
}

// ─── Phase 12: PRD & Change Transaction Types ────────────────────────────────
export interface PRDUserStory {
  story: string;
  given: string;
  when: string;
  then: string;
}

export interface PRDTeamComposition {
  userId: string;
  roleId?: string;
}

export interface PRDDiffItem {
  field: string;
  before: any;
  after: any;
}

export interface PRDDocument {
  id?: string;
  _id?: string;
  project_id: string;
  version: string;
  executive_summary: string;
  scope_in: string[];
  scope_out: string[];
  user_stories: PRDUserStory[];
  technical_architecture: string;
  team_composition: PRDTeamComposition[];
  status: "draft" | "approved" | "superseded";
  superseded_by?: string | null;
  diff_summary?: PRDDiffItem[];
  created_by: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConsequenceSummary {
  deltaHours: number;
  deltaDays: number;
  deltaCost: number;
  formattedCostDelta?: string;
  affectedTaskIds: string[];
  utilizationImpact: Array<{ userId: string; newUtilizationPct: number }>;
}

export interface ChangeTransaction {
  id?: string;
  _id?: string;
  project_id: string;
  requested_by: string;
  change_description: string;
  consequence_summary: ConsequenceSummary;
  prd_version_before: string;
  prd_version_after: string;
  tasks_added: string[];
  tasks_modified: Array<{ taskId: string; before: any; after: any }>;
  status: "applied" | "rolled_back";
  applied_at: string;
  rolled_back_at?: string | null;
  rolled_back_by?: string | null;
  rollback_blocked_reason?: string | null;
}

export interface RollbackImpact {
  canRollback: boolean;
  orphanedWork: Array<{ taskId: string; title: string; hoursCompleted: number }>;
  conflictingTasks: Array<{ taskId: string; reason: string }>;
  hoursToBeFreed: number;
  blockReason: string | null;
}

export interface ScopeChangePreview {
  project_id: string;
  change_description: string;
  consequence_summary: ConsequenceSummary;
  prd_version_before: string;
  prd_version_after: string;
  tasks_to_add: any[];
  tasks_to_modify: any[];
}

