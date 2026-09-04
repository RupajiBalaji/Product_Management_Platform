import { auth } from "./firebase";
import type { UserProfile, Project, Task, DailyLog, ProjectPriority, DynamicRole, TeamAllocation } from "./types";

const API_BASE = import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ""
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.PROD ? "" : "http://localhost:5000");

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: "include", // Automatically send & receive HTTP-only cookies
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.message || errorData.error || `HTTP error ${res.status}: ${res.statusText}`;
    const err: any = new Error(message);
    err.status = res.status;
    err.data = errorData;
    throw err;
  }

  return res.json();
}

function normalizeDoc<T extends { _id?: string; id?: string }>(doc: T): T {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.id || doc._id || "",
  };
}

function normalizeDocs<T extends { _id?: string; id?: string }>(docs: T[]): T[] {
  if (!Array.isArray(docs)) return [];
  return docs.map(normalizeDoc);
}

// ─── Production Session & Cookie Management ───────────────────────────────────

export async function createServerSession(userData: {
  uid: string;
  email: string;
  full_name?: string;
  role_title?: string;
  photo_url?: string;
  user_type?: "pm" | "employee";
}): Promise<UserProfile> {
  const data = await apiFetch("/api/auth/session", {
    method: "POST",
    body: JSON.stringify(userData),
  });
  return normalizeDoc(data.user);
}

export async function getCurrentServerSession(): Promise<UserProfile | null> {
  try {
    const data = await apiFetch("/api/auth/me");
    return normalizeDoc(data.user);
  } catch {
    return null;
  }
}

export async function logoutServerSession(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch (err) {
    console.warn("Logout error:", err);
  }
}

export async function switchUserSession(userId: string): Promise<UserProfile> {
  const data = await apiFetch(`/api/auth/switch-user/${userId}`, { method: "POST" });
  return normalizeDoc(data.user);
}

export async function toggleUserRole(): Promise<UserProfile> {
  const data = await apiFetch("/api/auth/switch-role", { method: "POST" });
  return normalizeDoc(data.user);
}

// ─── Users & Workforce Directory ─────────────────────────────────────────────

export async function syncUserWithDB(profileData?: {
  full_name?: string;
  role_title?: string;
  photo_url?: string;
}): Promise<UserProfile> {
  const data = await apiFetch("/api/users/sync", {
    method: "POST",
    body: JSON.stringify(profileData || {}),
  });
  return normalizeDoc(data);
}

export async function getAllEmployees(): Promise<UserProfile[]> {
  try {
    const data = await apiFetch("/api/users/employees");
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function getWorkforceStats(): Promise<{
  totalEmployees: number;
  unallocatedCount: number;
  multiProjectCount: number;
  activeCount: number;
} | null> {
  try {
    return await apiFetch("/api/users/workforce-stats");
  } catch {
    return null;
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const data = await apiFetch(`/api/users/${uid}`);
    return normalizeDoc(data);
  } catch {
    return null;
  }
}

export async function createEmployee(data: {
  uid?: string;
  email: string;
  full_name: string;
  role_title: string;
}): Promise<UserProfile> {
  const result = await apiFetch("/api/users/create-employee", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(result);
}

export async function deleteEmployee(id: string): Promise<void> {
  await apiFetch(`/api/users/${id}`, { method: "DELETE" });
}

// ─── Projects & Team Management ───────────────────────────────────────────────

export async function createProject(data: {
  title: string;
  description: string;
  member_ids: string[];
  priority?: ProjectPriority;
}): Promise<Project> {
  const result = await apiFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(result);
}

export async function getAllProjects(): Promise<Project[]> {
  try {
    const data = await apiFetch("/api/projects");
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function getProjectById(id: string): Promise<(Project & { members?: UserProfile[] }) | null> {
  try {
    const data = await apiFetch(`/api/projects/${id}`);
    return {
      ...normalizeDoc(data),
      members: normalizeDocs(data.members || []),
    };
  } catch {
    return null;
  }
}

export async function getEmployeeProjects(_userId?: string): Promise<Project[]> {
  try {
    const data = await apiFetch("/api/projects/my");
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function updateProjectStatus(id: string, status: Project["status"]): Promise<void> {
  await apiFetch(`/api/projects/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateProjectPriority(id: string, priority: ProjectPriority): Promise<Project> {
  const data = await apiFetch(`/api/projects/${id}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ priority }),
  });
  return normalizeDoc(data);
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  roleId?: string,
  dailyHours?: number
): Promise<Project & { members?: UserProfile[] }> {
  const data = await apiFetch(`/api/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId, roleId, dailyHours }),
  });
  return {
    ...normalizeDoc(data),
    members: normalizeDocs(data.members || []),
  };
}

// ─── Dynamic Role Engine (Phase 1) ──────────────────────────────────────────

export async function getRoles(): Promise<DynamicRole[]> {
  try {
    const data = await apiFetch("/api/roles");
    return normalizeDocs(data.roles || []);
  } catch {
    return [];
  }
}

export async function getRoleById(id: string): Promise<DynamicRole | null> {
  try {
    const data = await apiFetch(`/api/roles/${id}`);
    return normalizeDoc(data.role);
  } catch {
    return null;
  }
}

export async function createDynamicRole(data: {
  title: string;
  domain: string;
  description?: string;
  skillTags: string[];
  defaultDailyCapHours: number;
  orgScoped?: boolean;
}): Promise<DynamicRole> {
  const res = await apiFetch("/api/roles", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(res.role);
}

export async function updateDynamicRole(
  id: string,
  data: Partial<{
    title: string;
    domain: string;
    description: string;
    skillTags: string[];
    defaultDailyCapHours: number;
    orgScoped: boolean;
  }>
): Promise<DynamicRole> {
  const res = await apiFetch(`/api/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return normalizeDoc(res.role);
}

export async function deleteDynamicRole(id: string): Promise<void> {
  await apiFetch(`/api/roles/${id}`, { method: "DELETE" });
}

export async function removeProjectMember(projectId: string, userId: string): Promise<Project & { members?: UserProfile[] }> {
  const data = await apiFetch(`/api/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
  return {
    ...normalizeDoc(data),
    members: normalizeDocs(data.members || []),
  };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(data: {
  project_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  assignee_ids: string[];
  depends_on?: string[];
  estimate_hours?: number;
}): Promise<Task> {
  const result = await apiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(result);
}

export async function updateTask(
  taskId: string,
  data: Partial<{
    title: string;
    description: string;
    start_date: string;
    end_date: string;
    assignee_ids: string[];
    status: "active" | "completed";
    estimate_hours: number;
    logged_hours: number;
    depends_on: string[];
  }>
): Promise<Task> {
  const result = await apiFetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return normalizeDoc(result.task || result);
}

export async function updateTaskDependencies(
  taskId: string,
  dependsOn: string[]
): Promise<{ success: boolean; task?: Task; error?: string; cyclePath?: string[]; message?: string }> {
  return await apiFetch(`/api/tasks/${taskId}/dependencies`, {
    method: "PATCH",
    body: JSON.stringify({ depends_on: dependsOn }),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
}

export async function getProjectTaskGraph(projectId: string): Promise<Task[]> {
  try {
    const data = await apiFetch(`/api/tasks/project/${projectId}/graph`);
    return normalizeDocs(data.tasks || []);
  } catch {
    return [];
  }
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  try {
    const data = await apiFetch(`/api/tasks/project/${projectId}`);
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function getMyTasks(): Promise<Task[]> {
  try {
    const data = await apiFetch("/api/tasks/my");
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function getTasksByEmployee(userId: string): Promise<Task[]> {
  try {
    const data = await apiFetch(`/api/tasks/employee/${userId}`);
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function getTaskById(id: string): Promise<Task | null> {
  try {
    const data = await apiFetch(`/api/tasks/${id}`);
    return normalizeDoc(data);
  } catch {
    return null;
  }
}

// ─── Daily Logs ───────────────────────────────────────────────────────────────

export async function submitDailyLog(data: {
  task_id: string;
  log_date: string;
  work_text: string;
  has_worked: boolean;
  no_work_reason: string;
}): Promise<DailyLog> {
  const result = await apiFetch("/api/logs", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(result);
}

export async function getDailyLog(
  taskId: string,
  _userId: string,
  logDate: string
): Promise<DailyLog | null> {
  try {
    const data = await apiFetch(`/api/logs/task/${taskId}/date/${logDate}`);
    return normalizeDoc(data);
  } catch {
    return null;
  }
}

export async function getLogsByProject(projectId: string): Promise<DailyLog[]> {
  try {
    const data = await apiFetch(`/api/logs/project/${projectId}`);
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function getLogsByEmployee(userId: string): Promise<DailyLog[]> {
  try {
    const data = await apiFetch(`/api/logs/employee/${userId}`);
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

export async function getLogsByTask(taskId: string): Promise<DailyLog[]> {
  try {
    const data = await apiFetch(`/api/logs/task/${taskId}`);
    return normalizeDocs(data);
  } catch {
    return [];
  }
}

// ─── Analytics & Aggregation ─────────────────────────────────────────────────

export async function getDashboardSummary() {
  try {
    return await apiFetch("/api/analytics/dashboard-summary");
  } catch {
    return null;
  }
}

export async function getEmployee360Analytics(userId: string) {
  try {
    const data = await apiFetch(`/api/analytics/employee/${userId}`);
    return {
      ...data,
      user: normalizeDoc(data.user),
      projects: normalizeDocs(data.projects || []),
      tasks: normalizeDocs(data.tasks || []),
      activeTasks: normalizeDocs(data.activeTasks || []),
      logs: normalizeDocs(data.logs || []),
    };
  } catch {
    return null;
  }
}

// ─── AI Intelligence Copilot ─────────────────────────────────────────────────

export async function askAICopilot(question: string): Promise<string> {
  const data = await apiFetch("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
  return data.answer;
}

export async function getAIPlatformContext() {
  try {
    return await apiFetch("/api/ai/context");
  } catch {
    return null;
  }
}

export async function generateDimensionSummary(params: {
  dimension: string;
  projectId?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  statusFlag?: string;
}): Promise<string> {
  const data = await apiFetch("/api/ai/summary", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return data.summary;
}
