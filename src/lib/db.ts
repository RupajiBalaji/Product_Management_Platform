import { auth } from "./firebase";
import type { UserProfile, Project, Task, DailyLog, ProjectPriority, DynamicRole, TeamAllocation } from "./types";

const API_BASE = import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ""
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.PROD ? "" : "http://localhost:5000");

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await auth?.currentUser?.getIdToken?.().catch(() => null);
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

export async function authRegister(data: {
  email: string;
  password: string;
  full_name: string;
  role_title?: string;
  user_type?: UserType;
}): Promise<UserProfile> {
  const result = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(result.user);
}

export async function authLogin(data: {
  email: string;
  password: string;
}): Promise<UserProfile> {
  const result = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(result.user);
}

export async function createServerSession(userData: {
  uid: string;
  email: string;
  full_name?: string;
  role_title?: string;
  photo_url?: string;
  user_type?: UserType;
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
  dailyHours?: number,
  force?: boolean
): Promise<Project & { members?: UserProfile[] }> {
  const data = await apiFetch(`/api/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId, roleId, dailyHours, force }),
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
  evaluationMode?: import("@/lib/constants").EvaluationMode;
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
    evaluationMode: import("@/lib/constants").EvaluationMode;
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

// ─── Phase 3: Capacity Registry ───────────────────────────────────────────────

export async function getCapacityForUser(userId: string) {
  try {
    return await apiFetch(`/api/capacity/${userId}`);
  } catch {
    return null;
  }
}

export async function getCapacityDashboard(): Promise<import("@/lib/types").EmployeeCapacity[]> {
  try {
    const data = await apiFetch("/api/capacity/dashboard");
    return data.data || [];
  } catch {
    return [];
  }
}

// ─── Phase 4: QA Gate & Submissions ───────────────────────────────────────────

export async function createSubmission(data: {
  task_id: string;
  artifact_url: string;
  artifact_type?: string;
}): Promise<{ success: boolean; submissionId: string; status: string; message: string }> {
  return await apiFetch("/api/submissions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getSubmissionById(id: string): Promise<import("@/lib/types").Submission | null> {
  try {
    const res = await apiFetch(`/api/submissions/${id}`);
    return normalizeDoc(res.submission);
  } catch {
    return null;
  }
}

export async function getSubmissionsByTask(taskId: string): Promise<import("@/lib/types").Submission[]> {
  try {
    const res = await apiFetch(`/api/submissions/task/${taskId}`);
    return normalizeDocs(res.submissions || []);
  } catch {
    return [];
  }
}

export async function getPendingSubmissions(): Promise<import("@/lib/types").Submission[]> {
  try {
    const res = await apiFetch("/api/submissions/pending-review");
    return normalizeDocs(res.submissions || []);
  } catch {
    return [];
  }
}

export async function reviewSubmissionHuman(
  id: string,
  decision: "approved" | "rejected",
  notes?: string
): Promise<import("@/lib/types").Submission> {
  const res = await apiFetch(`/api/submissions/${id}/human-review`, {
    method: "POST",
    body: JSON.stringify({ decision, notes }),
  });
  return normalizeDoc(res.submission);
}

// ─── Phase 4: Appeals ─────────────────────────────────────────────────────────

export async function createAppeal(data: {
  submission_id: string;
  justification: string;
}): Promise<import("@/lib/types").Appeal> {
  const res = await apiFetch("/api/appeals", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(res.appeal);
}

export async function getPendingAppeals(): Promise<import("@/lib/types").Appeal[]> {
  try {
    const res = await apiFetch("/api/appeals/pending");
    return normalizeDocs(res.appeals || []);
  } catch {
    return [];
  }
}

export async function getAppealById(id: string): Promise<import("@/lib/types").Appeal | null> {
  try {
    const res = await apiFetch(`/api/appeals/${id}`);
    return normalizeDoc(res.appeal);
  } catch {
    return null;
  }
}

export async function resolveAppeal(
  id: string,
  decision: "overridden" | "upheld",
  notes?: string
): Promise<{ success: boolean; appeal: import("@/lib/types").Appeal; submission?: import("@/lib/types").Submission }> {
  const res = await apiFetch(`/api/appeals/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ decision, notes }),
  });
  return {
    ...res,
    appeal: normalizeDoc(res.appeal),
    submission: res.submission ? normalizeDoc(res.submission) : undefined,
  };
}

// ─── Phase 5: Slippage & Rejection Loop Escalations ───────────────────────────

export async function getActiveSlippageEscalations(): Promise<import("@/lib/types").SlippageEvent[]> {
  try {
    const res = await apiFetch("/api/slippage/escalations");
    return normalizeDocs(res.events || []);
  } catch {
    return [];
  }
}

export async function getProjectSlippageEvents(projectId: string): Promise<import("@/lib/types").SlippageEvent[]> {
  try {
    const res = await apiFetch(`/api/slippage/project/${projectId}`);
    return normalizeDocs(res.events || []);
  } catch {
    return [];
  }
}

export async function getEmployeeSlippageEvents(userId: string): Promise<import("@/lib/types").SlippageEvent[]> {
  try {
    const res = await apiFetch(`/api/slippage/employee/${userId}`);
    return normalizeDocs(res.events || []);
  } catch {
    return [];
  }
}

export async function resolveSlippageEvent(
  id: string,
  resolutionChosen: string
): Promise<{ success: boolean; slippageEvent: import("@/lib/types").SlippageEvent }> {
  const res = await apiFetch(`/api/slippage/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution_chosen: resolutionChosen }),
  });
  return {
    ...res,
    slippageEvent: normalizeDoc(res.slippageEvent),
  };
}

export async function triggerManualSlippageCheck(): Promise<any> {
  const res = await apiFetch("/api/slippage/run-check", {
    method: "POST",
    headers: {
      "x-internal-secret": "autonomous-pm-internal-secret",
    },
  });
  return res.results;
}

// ─── Phase 6: Employee Action Mode & Clarifications ───────────────────────────

export async function reorderTask(
  taskId: string,
  newPosition: number
): Promise<{ success: boolean; message: string; actionRequest: import("@/lib/types").ActionRequest; task?: Task }> {
  const res = await apiFetch("/api/actions/reorder", {
    method: "POST",
    body: JSON.stringify({ taskId, newPosition }),
  });
  return {
    ...res,
    actionRequest: normalizeDoc(res.actionRequest),
    task: res.task ? normalizeDoc(res.task) : undefined,
  };
}

export async function swapTask(
  taskId: string,
  targetDate: string
): Promise<{ success: boolean; message: string; actionRequest: import("@/lib/types").ActionRequest; task?: Task }> {
  const res = await apiFetch("/api/actions/swap", {
    method: "POST",
    body: JSON.stringify({ taskId, targetDate }),
  });
  return {
    ...res,
    actionRequest: normalizeDoc(res.actionRequest),
    task: res.task ? normalizeDoc(res.task) : undefined,
  };
}

export async function postponeTask(
  taskId: string,
  requestedDays: number,
  reason: string
): Promise<{ success: boolean; message: string; actionRequest: import("@/lib/types").ActionRequest }> {
  const res = await apiFetch("/api/actions/postpone", {
    method: "POST",
    body: JSON.stringify({ taskId, requestedDays, reason }),
  });
  return {
    ...res,
    actionRequest: normalizeDoc(res.actionRequest),
  };
}

export async function requestClarification(
  taskId: string,
  question: string
): Promise<{
  success: boolean;
  autoAnswered: boolean;
  answer?: string;
  message: string;
  actionRequest: import("@/lib/types").ActionRequest;
}> {
  const res = await apiFetch("/api/actions/request-clarification", {
    method: "POST",
    body: JSON.stringify({ taskId, question }),
  });
  return {
    ...res,
    actionRequest: normalizeDoc(res.actionRequest),
  };
}

export async function getPendingClarifications(): Promise<import("@/lib/types").ActionRequest[]> {
  try {
    const res = await apiFetch("/api/actions/clarifications/pending");
    return normalizeDocs(res.clarifications || []);
  } catch {
    return [];
  }
}

export async function answerClarification(
  id: string,
  answer: string
): Promise<{ success: boolean; message: string; actionRequest: import("@/lib/types").ActionRequest }> {
  const res = await apiFetch(`/api/actions/clarifications/${id}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
  return {
    ...res,
    actionRequest: normalizeDoc(res.actionRequest),
  };
}

export async function getTaskActionHistory(taskId: string): Promise<import("@/lib/types").ActionRequest[]> {
  try {
    const res = await apiFetch(`/api/actions/history/${taskId}`);
    return normalizeDocs(res.actions || []);
  } catch {
    return [];
  }
}

// ─── Phase 7: Sub-Task Decomposition & Task Priority ─────────────────────────

export async function createSubtask(
  parentTaskId: string,
  data: {
    title: string;
    description?: string;
    estimate_hours?: number;
    acceptance_criteria_override?: string;
    start_date?: string;
    end_date?: string;
    assignee_ids?: string[];
  }
): Promise<import("@/lib/types").Task> {
  const res = await apiFetch(`/api/tasks/${parentTaskId}/subtasks`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return normalizeDoc(res.subtask);
}

export async function getSubtasks(parentTaskId: string): Promise<import("@/lib/types").Task[]> {
  try {
    const res = await apiFetch(`/api/tasks/${parentTaskId}/subtasks`);
    return normalizeDocs(res.subtasks || []);
  } catch {
    return [];
  }
}

export async function getTaskProgress(taskId: string): Promise<import("@/lib/types").TaskProgressResponse> {
  return await apiFetch(`/api/tasks/${taskId}/progress`);
}

export async function recalculateProjectPriorities(
  projectId: string
): Promise<{ success: boolean; message: string; tasks: any[] }> {
  return await apiFetch(`/api/tasks/project/${projectId}/recalculate-priorities`, {
    method: "POST",
  });
}

// ─── Phase 8: Portfolio Dashboard & Budget Tracking ───────────────────────────

export async function getPortfolioDashboard(): Promise<import("@/lib/types").PortfolioDashboardResponse> {
  return await apiFetch("/api/portfolio/dashboard");
}

export async function getPortfolioUtilizationHeatmap(): Promise<{
  success: boolean;
  heatmap: import("@/lib/types").UtilizationHeatmapItem[];
}> {
  return await apiFetch("/api/portfolio/utilization-heatmap");
}

export async function getProjectBudget(
  projectId: string
): Promise<import("@/lib/types").ProjectBudgetDetail> {
  return await apiFetch(`/api/projects/${projectId}/budget`);
}

export async function updateUserCostRate(
  userId: string,
  hourlyCostRate: number
): Promise<{ success: boolean; message: string; user: any }> {
  return await apiFetch(`/api/users/${userId}/cost-rate`, {
    method: "PATCH",
    body: JSON.stringify({ hourly_cost_rate: hourlyCostRate }),
  });
}

// ─── Phase 9: Subject Matter Expert (SME) Invites & Deliberation ──────────────

export async function getCreationThread(
  projectId: string
): Promise<{ success: boolean; thread: import("@/lib/types").CreationThread }> {
  return await apiFetch(`/api/projects/${projectId}/creation-thread`);
}

export async function postCreationThreadMessage(
  projectId: string,
  content: string
): Promise<{ success: boolean; message: import("@/lib/types").CreationThreadMessage }> {
  return await apiFetch(`/api/projects/${projectId}/creation-thread/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function inviteSMEExpert(
  projectId: string,
  userId: string
): Promise<{ success: boolean; message: string; invited_expert: import("@/lib/types").InvitedExpert }> {
  return await apiFetch(`/api/projects/${projectId}/creation-thread/invite-expert`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function revokeSMEExpert(
  projectId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  return await apiFetch(`/api/projects/${projectId}/creation-thread/revoke-expert`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function finalizeCreationThread(
  projectId: string
): Promise<{ success: boolean; message: string; thread: import("@/lib/types").CreationThread }> {
  return await apiFetch(`/api/projects/${projectId}/creation-thread/finalize`, {
    method: "POST",
  });
}

export async function getMySMEInvitations(): Promise<{
  success: boolean;
  invitations: import("@/lib/types").SMEInvitationItem[];
}> {
  try {
    return await apiFetch("/api/creation-threads/my-invitations");
  } catch {
    return { success: true, invitations: [] };
  }
}
