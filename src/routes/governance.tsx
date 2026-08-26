import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertOctagon, ShieldCheck, Snowflake } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Panel, Pill, SectionHeading } from "@/components/primitives";
import { alerts, edgeCases, permissionMatrix } from "@/lib/platform-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/governance")({
  head: () => ({
    meta: [
      { title: "Resilience & Governance — Autonomous PM" },
      {
        name: "description",
        content:
          "13-point edge-case resilience framework, tiered inactivity escalation, permission matrix and the 3-day slippage detection engine.",
      },
      { property: "og:title", content: "Resilience & Governance — Autonomous PM" },
      { property: "og:description", content: "Sovereign governance with audit-grade resilience protocols." },
    ],
  }),
  component: GovernancePage,
});

const levelTone = (l: string) =>
  l === "Critical" ? "danger" : l === "Important" ? "warning" : "accent";

function GovernancePage() {
  return (
    <AppShell eyebrow="Bulletproof Pillars" title="Resilience & Governance">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Critical", edgeCases.filter((e) => e.level === "Critical").length, "Platform failure or team paralysis if unaddressed", "text-destructive"],
          ["Important", edgeCases.filter((e) => e.level === "Important").length, "Operational degradation and escalating technical debt", "text-warning"],
          ["Polish", edgeCases.filter((e) => e.level === "Polish").length, "Usability, scalability and team satisfaction", "text-accent"],
        ].map(([label, count, desc, tone]) => (
          <Panel key={label as string} className="p-4">
            <p className={cn("font-display text-3xl font-semibold", tone as string)}>{count}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{label as string} edge cases covered</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{desc as string}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-6">
        <SectionHeading
          eyebrow="13-point framework"
          title="Edge-case coverage registry"
          description="Every protocol is embedded into the platform — click any surface link to see it operating."
        />
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-eyebrow">
                <th className="pb-3 pr-4 font-normal">#</th>
                <th className="pb-3 pr-4 font-normal">Edge case</th>
                <th className="pb-3 pr-4 font-normal">Risk level</th>
                <th className="pb-3 pr-4 font-normal">Engineered solution</th>
                <th className="pb-3 font-normal">Live surface</th>
              </tr>
            </thead>
            <tbody>
              {edgeCases.map((e) => (
                <tr key={e.n} className="border-b border-border/60 last:border-b-0">
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{e.n}</td>
                  <td className="py-3 pr-4 font-medium text-foreground">{e.name}</td>
                  <td className="py-3 pr-4">
                    <Pill tone={levelTone(e.level)}>{e.level}</Pill>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{e.solution}</td>
                  <td className="py-3">
                    <Link
                      to={e.surface}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {e.surface}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="text-eyebrow flex items-center gap-1.5">
            <AlertOctagon className="size-3" /> Slippage detection engine
          </p>
          <h3 className="mt-1 font-display text-base font-semibold text-foreground">
            Automated 3-day escalation ladder
          </h3>
          <div className="mt-4 space-y-3">
            {[
              ["Day 1", "Level 0", "Partial submission logged, Day 2 queue rebalanced.", "muted"],
              ["Day 2", "Level 1", "Second consecutive slippage — gentle in-chat reminder.", "warning"],
              ["Day 3", "Level 2", "Circuit breaker fires — CEO priority alert with resolution options.", "danger"],
            ].map(([day, level, desc, tone]) => (
              <div key={day} className="flex items-start gap-3 rounded-md border border-border bg-elevated p-3">
                <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{day}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Pill tone={tone as "muted" | "warning" | "danger"}>{level}</Pill>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {alerts.slice(0, 3).map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <Pill tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "muted"}>
                    {a.tier}
                  </Pill>
                  <span className="font-mono text-[10px] text-muted-foreground">{a.age}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{a.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.body}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {a.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => toast.success(`Resolution applied: ${o}`)}
                      className="rounded-md border border-border bg-elevated px-2.5 py-1 text-[11px] text-foreground hover:border-primary/40"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <p className="text-eyebrow">Edge Case #5 · Critical</p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Tiered inactivity escalation
            </h3>
            <div className="mt-4 space-y-2.5">
              {[
                ["Tier 1 · 6 hrs", "In-platform priority badge and push alert on the pending action."],
                ["Tier 2 · 24 hrs", "In-platform summary digest with deep-link back to the blocked item."],
                ["Tier 3 · 48 hrs", "Delegate authority activation — pre-configured deputy gains item-scoped approval power."],
              ].map(([tier, desc], i) => (
                <div
                  key={tier}
                  className={cn(
                    "rounded-md border p-3",
                    i === 2 ? "border-destructive/40 bg-destructive/10" : "border-border bg-elevated",
                  )}
                >
                  <p className="font-mono text-xs text-primary">{tier}</p>
                  <p className="mt-1 text-sm text-foreground">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              All escalation events, delegate actions and resolutions are permanently logged. 100%
              internal containment — zero external mail dependency.
            </p>
          </Panel>

          <Panel>
            <p className="text-eyebrow flex items-center gap-1.5">
              <Snowflake className="size-3" /> Edge Case #8 · Important
            </p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Project lifecycle state machine
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => toast.success("Project frozen — queues cleared, capacity released to ledger, snapshot archived")}
                className="rounded-md border border-border bg-elevated px-3.5 py-2 text-sm text-foreground hover:border-primary/40"
              >
                Freeze project
              </button>
              <button
                onClick={() => toast.success("Project archived — final read-only snapshot sealed")}
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm text-destructive hover:bg-destructive/20"
              >
                Archive project
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Freeze preserves full state for resumption; archive seals it. Either way, employees are
              notified in-chat, queues are cleared, and every allocated hour returns to the Global
              Ledger.
            </p>
          </Panel>

          <Panel>
            <p className="text-eyebrow flex items-center gap-1.5">
              <ShieldCheck className="size-3" /> Edge Case #10 · Important
            </p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              Artifact storage governance
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>· 100 MB per-file cap — oversized submissions become validated external links</li>
              <li>· Role-bound formats: engineers (PRs, archives), design (Figma, SVG), QA (HAR, reports)</li>
              <li>· 90-day cold-storage migration on completed projects</li>
              <li>· Storage analytics: 84.2 GB consumed, Elena Rostova top contributor (31 GB)</li>
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <SectionHeading
          eyebrow="Role-based permissions"
          title="Permission & audit matrix"
          description="Sovereign strategic authority with you; employee interactions bounded by automated guardrails."
        />
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-eyebrow">
                <th className="pb-3 pr-4 font-normal">Capability</th>
                <th className="pb-3 pr-4 font-normal">Product Manager</th>
                <th className="pb-3 pr-4 font-normal">Lead Architect / PM</th>
                <th className="pb-3 font-normal">Contributors</th>
              </tr>
            </thead>
            <tbody>
              {permissionMatrix.map((row) => (
                <tr key={row.capability} className="border-b border-border/60 last:border-b-0">
                  <td className="py-3 pr-4 text-foreground">{row.capability}</td>
                  <td className="py-3 pr-4 font-medium text-primary">{row.pm}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{row.lead}</td>
                  <td className="py-3 text-muted-foreground">{row.contributor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </AppShell>
  );
}
