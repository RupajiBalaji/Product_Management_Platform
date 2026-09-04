import { cn } from "@/lib/utils";

export { cn };

export type UserType = "product_lead" | "lead_architect" | "employee" | "pm";
export type ProjectPriority = "low" | "medium" | "high" | "critical";
export type ProjectStatus = "active" | "in-review" | "completed" | "frozen" | "archived";

export interface DynamicRole {
  id: string;
  _id?: string;
  title: string;
  domain: string;
  description: string;
  skillTags: string[];
  defaultDailyCapHours: number;
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
  assignedProjects?: Array<{ _id: string; title: string; status: string; priority: ProjectPriority }>;
  created_at: string;
}

export interface Project {
  id: string;
  _id?: string;
  title: string;
  description: string;
  created_by: string;
  status: ProjectStatus;
  priority: ProjectPriority;
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
