import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, Filter, Users, User, FolderKanban, CheckSquare, Building2, Calendar, Flame } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { generateDimensionSummary, askAICopilot, getAllProjects, getAllEmployees } from "@/lib/db";
import type { Project, UserProfile } from "@/lib/types";
import { isElevatedPriority, normalizePriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/pm/ai-hub")({
  component: AIHubPage,
});

interface ChatMessage {
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

type SummaryDimension = "organization" | "project" | "team_cohort" | "employee" | "task";

export function AIHubPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Summary panel state
  const [summaryDimension, setSummaryDimension] = useState<SummaryDimension>("organization");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFlag, setStatusFlag] = useState<"all" | "worked" | "no-work">("all");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Chat panel state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "ai",
      content:
        "👋 Hello! I'm your Autonomous PM AI Copilot powered by Gemini 3.5 Flash-Lite. Ask me anything about project deadlines, employee workloads, priority allocations, or blocker bottlenecks.",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const [p, e] = await Promise.all([getAllProjects(), getAllEmployees()]);
      setProjects(p);
      setEmployees(e);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const uniqueRoles = Array.from(new Set(employees.map((e) => e.role_title).filter(Boolean)));

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    try {
      const result = await generateDimensionSummary({
        dimension: summaryDimension,
        projectId: selectedProjectId !== "all" ? selectedProjectId : undefined,
        employeeId: selectedEmployeeId !== "all" ? selectedEmployeeId : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        statusFlag: statusFlag !== "all" ? statusFlag : undefined,
      });
      setSummary(result);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: question, timestamp: new Date() }]);
    setChatLoading(true);
    try {
      const answer = await askAICopilot(question);
      setMessages((prev) => [...prev, { role: "ai", content: answer, timestamp: new Date() }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `⚠️ ${err.message || "Sorry, I encountered an error. Please try again."}`, timestamp: new Date() },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const dimensions = [
    { id: "organization", label: "Fleet / Org", icon: Building2, desc: "Macro company-wide executive digest" },
    { id: "project", label: "Project", icon: FolderKanban, desc: "Health, deadlines & project milestones" },
    { id: "team_cohort", label: "Team Cohort", icon: Users, desc: "Comparative role & team output" },
    { id: "employee", label: "Single Employee", icon: User, desc: "Individual contributions & blockers" },
    { id: "task", label: "Task Tracking", icon: CheckSquare, desc: "Granular milestone progression" },
  ] as const;

  return (
    <AppShell eyebrow="Intelligence & Executive Reporting" title="Multi-Dimensional AI Summary Hub">
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Left: AI Multi-Dimensional Summary Control Panel */}
        <div className="flex flex-col gap-4">
          <div className="panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-primary" />
                <h2 className="font-display font-bold text-foreground text-sm">5-Dimension AI Summary Control Panel</h2>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground bg-elevated px-2 py-0.5 rounded border border-border">
                Gemini 3.5 Flash-Lite
              </span>
            </div>

            {/* 1. Dimension Selector */}
            <div>
              <label className="text-eyebrow mb-2 block">1. Select AI Synthesis Dimension</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {dimensions.map((dim) => {
                  const Icon = dim.icon;
                  const active = summaryDimension === dim.id;
                  return (
                    <button
                      key={dim.id}
                      onClick={() => setSummaryDimension(dim.id as SummaryDimension)}
                      className={cn(
                        "flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                        active
                          ? "border-primary bg-primary/15 text-primary shadow-xs"
                          : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                      )}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Icon className="size-3.5" />
                        <span>{dim.label}</span>
                      </div>
                      <span className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">{dim.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Dynamic Dimension Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
              {/* Project Selector */}
              <div>
                <label className="text-eyebrow mb-1.5 block">Project Filter</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Projects ({projects.length})</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isElevatedPriority(normalizePriority(p.priority)) ? "🔥 " : ""}
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Employee / Cohort Selector */}
              <div>
                <label className="text-eyebrow mb-1.5 block">Employee Filter</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Employees ({employees.length})</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name} ({e.role_title})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Date Range & Quick Windows */}
            <div className="pt-2 border-t border-border/60">
              <label className="text-eyebrow mb-1.5 block">Timeframe Window</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-xl border border-input bg-elevated px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* 4. Status Flag Filter */}
            <div className="pt-2 border-t border-border/60">
              <label className="text-eyebrow mb-1.5 block">Submission Status Filter</label>
              <div className="flex gap-2">
                {(["all", "worked", "no-work"] as const).map((flag) => (
                  <button
                    key={flag}
                    onClick={() => setStatusFlag(flag)}
                    className={cn(
                      "flex-1 rounded-xl border py-2 text-xs font-semibold capitalize transition-all cursor-pointer",
                      statusFlag === flag
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-elevated text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {flag === "all" ? "All Submissions" : flag === "worked" ? "🟢 Work Logs Only" : "⚠️ Blockers Only"}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerateSummary}
              disabled={summaryLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-bold text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-60 transition-all cursor-pointer mt-2"
            >
              {summaryLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {summaryLoading ? "Synthesizing Multi-Dimensional Report…" : "✨ Generate AI Executive Summary"}
            </button>
          </div>

          {/* Rendered Summary Report */}
          {summary && (
            <div className="panel p-5 border-l-4 border-l-primary bg-gradient-to-b from-primary/5 via-card to-card">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-xl bg-primary/20 font-bold text-primary text-xs">
                    AI
                  </span>
                  <h3 className="font-display font-bold text-foreground text-sm">
                    Executive Summary · {summaryDimension.replace("_", " ").toUpperCase()}
                  </h3>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(summary).then(() => toast.success("Summary copied!"))}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  Copy Markdown
                </button>
              </div>
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {summary.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i} className="text-xs leading-relaxed text-foreground">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: AI Project Q&A Chat */}
        <div className="panel flex flex-col h-[640px]">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 font-bold text-primary-foreground text-xs shadow-glow">
                AI
              </span>
              <div>
                <h2 className="font-display font-bold text-foreground text-sm">Project AI Copilot</h2>
                <p className="text-eyebrow text-[9px]">Full real-time knowledge base of all projects & teams</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-elevated border border-border text-foreground rounded-tl-sm"
                  )}
                >
                  {msg.content.split("\n").filter(Boolean).map((line, j) => (
                    <p key={j} className={j > 0 ? "mt-1.5" : ""}>
                      {line}
                    </p>
                  ))}
                  <p
                    className={cn(
                      "text-[9px] mt-2 font-mono",
                      msg.role === "user" ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-elevated border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <Loader2 className="size-3 animate-spin text-primary mr-1.5" />
                    <span className="text-xs text-muted-foreground">Consulting MongoDB & Gemini 3.5...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleChat} className="p-3 border-t border-border flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask anything: e.g. 'How many days will project XYZ take?'"
              className="flex-1 rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatLoading}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-40 transition-all cursor-pointer"
            >
              <Send className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
