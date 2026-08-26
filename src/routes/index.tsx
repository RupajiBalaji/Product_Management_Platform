import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Metric, Panel, Pill, SectionHeading, UtilizationBar } from "@/components/primitives";
import { GanttChart } from "@/components/gantt";
import { alerts, getEmployee, globalLedger, projects } from "@/lib/platform-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Portfolio — Autonomous PM Command Platform" },
      {
        name: "description",
        content:
          "Portfolio command view: isolated project sandboxes, global capacity ledger, slippage escalations and executive authority gates.",
      },
      { property: "og:title", content: "Portfolio — Autonomous PM Command Platform" },
      {
        property: "og:description",
        content: "Cross-project visibility with a global capacity registry and edge-case resilience.",
      },
    ],
  }),
  component: Portfolio,
});

const healthTone = { "On Track": "success", "At Risk": "warning", Blocked: "danger" } as const;

function Portfolio() {
  const active = projects.filter((p) => p.state === "Active");
  const overCap = globalLedger.filter((l) => l.pct > 100).length;
  const totalHours = active
    .flatMap((p) => p.allocations)
    .reduce((s, a) => s + a.projectTotal, 0);

  return (
    <AppShell
      eyebrow="Executive Authority · Sovereign View"
      title="Project Portfolio"
      actions={
        <Link
          to="/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" /> New Project
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active Sandboxes" value={String(active.length)} sub="Fully isolated project environments" />
        <Metric label="Committed Hours" value={totalHours.toLocaleString()} sub="Across all active allocations" tone="primary" />
        <Metric label="Open Escalations" value={String(alerts.filter((a) => a.severity !== "info").length)} sub="Slippage · capacity · drift" tone="danger" />
        <Metric label="Capacity Collisions" value={String(overCap)} sub="Employees over daily ceiling" tone={overCap ? "danger" : "success"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionHeading eyebrow="Sandboxes" title="Isolated project environments" />
          <div className="space-y-4">
            {projects.map((p) => (
              <Panel key={p.id} className="transition-colors hover:border-primary/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-foreground">
                        {p.title}
                      </h3>
                      <Pill tone={p.state === "Active" ? "success" : p.state === "Frozen" ? "muted" : "warning"}>
                        {p.state}
                      </Pill>
                      <Pill tone={healthTone[p.health]}>{p.health}</Pill>
                    </div>
                    <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm text-muted-foreground">
                      {p.intent}
                    </p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      PRD {p.prdVersion} · {p.startedOn} → {p.targetDate} ·{" "}
                      {p.allocations.length} contributors
                    </p>
                  </div>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
                  >
                    Command Center <ArrowUpRight className="size-3.5" />
                  </Link>
                </div>
                <div className="mt-4">
                  <GanttChart project={p} compact />
                </div>
              </Panel>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="text-eyebrow">Global Capacity Registry</p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Cross-project ledger
            </h3>
            <div className="mt-4 space-y-3">
              {globalLedger.map((l) => (
                <div key={l.employee.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm text-foreground">{l.employee.name}</span>
                  <UtilizationBar pct={l.pct} />
                </div>
              ))}
            </div>
            <Link
              to="/capacity"
              className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open full ledger <ArrowUpRight className="size-3" />
            </Link>
          </Panel>

          <Panel>
            <p className="text-eyebrow">Escalation Engine</p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Priority alerts
            </h3>
            <div className="mt-4 space-y-3">
              {alerts.slice(0, 3).map((a) => (
                <div key={a.id} className="rounded-lg border border-border bg-elevated p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "muted"}>
                      {a.severity}
                    </Pill>
                    <span className="font-mono text-[10px] text-muted-foreground">{a.age}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-foreground">{a.title}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Delegate authority failsafe: armed at 48h inactivity.{" "}
              {alerts.filter((a) => a.tier.startsWith("Level 2")).length} items awaiting your
              authorization.
            </p>
          </Panel>

          <Panel>
            <p className="text-eyebrow">Team Reliability</p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Velocity scorecards
            </h3>
            <div className="mt-4 space-y-2.5">
              {globalLedger.slice(0, 4).map((l) => (
                <div key={l.employee.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{getEmployee(l.employee.id).name}</span>
                  <span className="font-mono text-xs text-success">
                    {l.employee.reliability}% on-time · {l.employee.firstPass}% first-pass
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
