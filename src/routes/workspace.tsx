import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, Clock, FileCheck2, Send, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AgentBubble, Panel, Pill, SectionHeading, UserBubble } from "@/components/primitives";
import { employeeQueue } from "@/lib/platform-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Employee Workspace — Autonomous PM" },
      {
        name: "description",
        content:
          "Contributor view: daily task queue in chat, PRD-grounded spec guidance, in-chat submissions, appeal flow and strict schedule guardrails.",
      },
      { property: "og:title", content: "Employee Workspace — Autonomous PM" },
      { property: "og:description", content: "Governed contributor execution with definition-of-done enforcement." },
    ],
  }),
  component: WorkspacePage,
});

const stateTone = {
  Queued: "muted",
  "In Progress": "primary",
  Submitted: "accent",
  Rejected: "danger",
  Blocked: "warning",
  Done: "success",
} as const;

const guardrails = [
  { action: "Reorder daily tasks", verdict: "Autonomous approval", detail: "DAG evaluated — zero conflict, swap approved.", ok: true },
  { action: "Swap task within week", verdict: "Autonomous approval", detail: "Within weekly capacity cap — approved.", ok: true },
  { action: "Postpone work / extend deadline", verdict: "BLOCKED", detail: "Critical schedule risk. Escalated; deadline authority rests with the Product Manager.", ok: false },
  { action: "Change project scope / deadline", verdict: "Strictly forbidden", detail: "Sovereign authority only — consequence disclosure required.", ok: false },
];

function WorkspacePage() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([
    {
      who: "agent" as const,
      text: "Good morning, Alex. Your 9:00 AM queue (America/New_York): rate limiter continuation — you are at 200% of the 8-hour estimate. A variance alert has been filed; the Product Manager sees the downstream impact. Focus the next session on the quota-signal branch only.",
    },
  ]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setMsgs((m) => [
      ...m,
      { who: "user" as const, text: q },
      {
        who: "agent" as const,
        text: "Grounded in PRD §Behavioral User Stories: the quota-exhausted path must queue the event and emit the quota signal — never drop. Reference the Given-When-Then criterion on task t-1. If you believe your last rejection was wrong, use 'Appeal This Decision' on the rejected card; it routes to human adjudication with your counter-argument attached.",
      },
    ]);
    setInput("");
  };

  return (
    <AppShell
      eyebrow="Contributor View · Alex Rivera · America/New_York"
      title="Employee Workspace"
      actions={<Pill tone="accent">Own Data + Dependencies tier</Pill>}
    >
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel>
            <SectionHeading
              eyebrow="Daily task queue"
              title="Today's prioritized queue"
              description="Delivered at 9:00 AM local time. Relational Gantt shows upstream blockers and downstream waiters."
            />
            <div className="space-y-3">
              {employeeQueue.map((t) => (
                <div key={t.id} className="rounded-lg border border-border bg-elevated p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.title}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Est {t.estimate}h · Logged {t.logged}h
                        {t.logged > t.estimate * 1.5 && (
                          <span className="text-destructive"> · &gt;50% overrun — alert filed</span>
                        )}
                      </p>
                    </div>
                    <Pill tone={stateTone[t.state]}>{t.state}</Pill>
                  </div>
                  {(t.dependsOn || t.blocks) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.dependsOn && (
                        <span className="text-warning">⬆ waiting on: {t.dependsOn}. </span>
                      )}
                      {t.blocks && <span className="text-accent">⬇ blocks: {t.blocks}.</span>}
                    </p>
                  )}
                  <div className="mt-2.5 space-y-1">
                    {t.criteria.map((c) => (
                      <p key={c} className="flex gap-2 text-xs text-muted-foreground">
                        <FileCheck2 className="mt-0.5 size-3 shrink-0 text-primary" />
                        <span>{c}</span>
                      </p>
                    ))}
                  </div>
                  {t.state === "Rejected" && (
                    <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                      <p className="text-xs font-medium text-destructive">
                        Rejected by Definition of Done gate: error handling missing on partial batch
                        failure.
                      </p>
                      <button
                        onClick={() =>
                          toast.success(
                            "Appeal filed — routed to human adjudication panel with your justification",
                          )
                        }
                        className="mt-2 rounded-md border border-destructive/50 bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40"
                      >
                        Appeal This Decision
                      </button>
                    </div>
                  )}
                  {(t.state === "Queued" || t.state === "In Progress") && (
                    <button
                      onClick={() =>
                        toast.success("Work submitted — artifact check running against acceptance criteria")
                      }
                      className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Submit work in chat
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="flex min-h-[320px] flex-col">
            <p className="text-eyebrow">On-demand spec guidance</p>
            <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
              {msgs.map((m, i) =>
                m.who === "agent" ? (
                  <AgentBubble key={i}>{m.text}</AgentBubble>
                ) : (
                  <UserBubble key={i} who="Alex Rivera">
                    {m.text}
                  </UserBubble>
                ),
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="mt-4 flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a spec question — answers stay grounded in the PRD…"
                className="flex-1 rounded-md border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Send className="size-4" /> Ask
              </button>
            </form>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="text-eyebrow flex items-center gap-1.5">
              <ShieldAlert className="size-3" /> Schedule governance guardrails
            </p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Action mode authority
            </h3>
            <div className="mt-4 space-y-2.5">
              {guardrails.map((g) => (
                <div
                  key={g.action}
                  className={cn(
                    "rounded-md border p-3",
                    g.ok ? "border-border bg-elevated" : "border-destructive/40 bg-destructive/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{g.action}</p>
                    {g.ok ? (
                      <Pill tone="success">{g.verdict}</Pill>
                    ) : (
                      <Pill tone="danger">
                        <Ban className="size-3" /> {g.verdict}
                      </Pill>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{g.detail}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <p className="text-eyebrow">Emergency absence</p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Leave & auto-rebalance
            </h3>
            <button
              onClick={() =>
                toast.success("Leave activated — slippage counter suppressed, critical-path work flagged for redistribution")
              }
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm text-foreground hover:border-primary/40"
            >
              <Clock className="size-4" /> Mark on leave (2 days)
            </button>
            <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
              False-alarm suppression arms instantly; the Product Manager receives ranked rebalancing
              options for any blocked critical-path work.
            </p>
          </Panel>

          <Panel>
            <p className="text-eyebrow">Your scorecard</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-elevated p-3">
                <p className="font-display text-xl font-semibold text-warning">78%</p>
                <p className="text-[11px] text-muted-foreground">On-time reliability index</p>
              </div>
              <div className="rounded-md border border-border bg-elevated p-3">
                <p className="font-display text-xl font-semibold text-warning">72%</p>
                <p className="text-[11px] text-muted-foreground">First-pass quality score</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Weekly recognition digest highlights Elena Rostova (97% / 95%) as this week's top
              contributor.
            </p>
          </Panel>

          <Panel>
            <p className="text-eyebrow">Notification preferences</p>
            <div className="mt-3 space-y-2 text-sm">
              {[
                ["Critical alerts", "Instant — never batched", true],
                ["Informational updates", "Digest at 9:00 AM & 2:00 PM", true],
                ["Passive summaries", "End-of-week digest", true],
              ].map(([label, desc]) => (
                <div key={label as string} className="flex items-center justify-between rounded-md border border-border bg-elevated px-3 py-2">
                  <div>
                    <p className="text-foreground">{label as string}</p>
                    <p className="text-xs text-muted-foreground">{desc as string}</p>
                  </div>
                  <span className="size-2.5 rounded-full bg-success" />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
