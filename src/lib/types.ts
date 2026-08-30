import { cn } from "@/lib/utils";

export { cn };

export type UserType = "pm" | "employee";
export type ProjectPriority = "low" | "medium" | "high" | "critical";

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
  assignedProjects?: Array<{ _id: string; title: string; status: string; priority: ProjectPriority }>;
  created_at: string;
}

export interface Project {
  id: string;
  _id?: string;
  title: string;
  description: string;
  created_by: string;
  status: "active" | "in-review" | "completed";
  priority: ProjectPriority;
  member_ids: string[];
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
