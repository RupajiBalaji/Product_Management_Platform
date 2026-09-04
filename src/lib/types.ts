import { cn } from "@/lib/utils";

export { cn };

// Re-export ProjectPriority from constants as the canonical type
export type { ProjectPriority, EvaluationMode, SubmissionStatus, AppealStatus } from "@/lib/constants";
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
  created_at: string;
}

export interface Task {
  id: string;
  _id?: string;
  project_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  assignee_ids: string[];
  status: "active" | "completed";
  depends_on?: string[] | Array<{ _id: string; title: string; status?: string }>;
  estimate_hours?: number;
  logged_hours?: number;
  created_at: string;
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


