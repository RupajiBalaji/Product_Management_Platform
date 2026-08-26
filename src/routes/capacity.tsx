import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Panel, Pill, SectionHeading, UtilizationBar } from "@/components/primitives";
import { alerts, globalLedger, utilizationBand } from "@/lib/platform-data";

export const Route = createFileRoute("/capacity")({
  head: () => ({
    meta: [
      { title: "Global Capacity Ledger — Autonomous PM" },
      {
        name: "description",
        content:
          "Cross-project capacity registry preventing silent overload: pre-allocation validation against every employee's daily ceiling.",
      },
      { property: "og:title", content: "Global Capacity Ledger — Autonomous PM" },
      { property: "og:description", content: "Unified cross-project utilization and collision resolution." },
    ],
  }),
  component: CapacityPage,
});

function CapacityPage() {
  const collision = alerts.find((a) => a.id === "a2")!;
  return (
    <AppShell eyebrow="Edge Case #1 · Critical" title="Global Capacity Ledger">
      <SectionHeading
        title="Central real-time capacity registry"
        description="Every allocation in every sandbox passes the pre-allocation validation gate against this ledger. A new commitment that would exceed an employee's daily ceiling is blocked and returned to you with resolution options — never silently scheduled."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-eyebrow">
                <th className="pb-3 font-normal">Team member</th>
                <th className="pb-3 font-normal">Daily cap</th>
                <th className="pb-3 font-normal">Commitments</th>
                <th className="pb-3 font-normal">Total</th>
                <th className="pb-3 font-normal">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {globalLedger.map((l) => (
                <tr key={l.employee.id} className="border-b border-border/60 last:border-b-0">
                  <td className="py-3.5">
                    <p className="font-medium text-foreground">{l.employee.name}</p>
                    <p className="text-xs text-muted-foreground">{l.employee.timezone}</p>
                  </td>
                  <td className="py-3.5 font-mono text-xs text-muted-foreground">
                    {l.employee.dailyCap.toFixed(1)} hrs/day
                  </td>
                  <td className="py-3.5">
                    <div className="space-y-1">
                      {l.lines.map((line) => (
                        <p key={line.projectId} className="text-xs text-muted-foreground">
                          <span className="text-foreground">{line.hours.toFixed(1)} hrs</span> ·{" "}
                          {line.project}
                        </p>
                      ))}
                      {l.employee.crossProjectHours > 0 && (
                        <p className="text-xs text-muted-foreground">
                          <span className="text-foreground">
                            {l.employee.crossProjectHours.toFixed(1)} hrs
                          </span>{" "}
                          · other commitments
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 font-mono text-xs text-foreground">
                    {l.allocated.toFixed(1)} hrs/day
                  </td>
                  <td className="py-3.5">
                    <UtilizationBar pct={l.pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-6">
          <Panel className="border-destructive/40">
            <Pill tone="danger">Collision blocked</Pill>
            <h3 className="mt-3 font-display text-base font-semibold text-foreground">
              {collision.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{collision.body}</p>
            <div className="mt-4 space-y-2">
              {collision.options.map((o, i) => (
                <button
                  key={o}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    i === 0
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  Option {String.fromCharCode(65 + i)} — {o}
                </button>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Authority: Product Manager override only
            </p>
          </Panel>

          <Panel>
            <p className="text-eyebrow">Validation Gate</p>
            <h3 className="mt-1 font-display text-base font-semibold text-foreground">
              How allocation is enforced
            </h3>
            <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              <li>
                <span className="font-mono text-xs text-primary">01</span> Agent proposes allocation
                during PRD synthesis or mid-project reassignment.
              </li>
              <li>
                <span className="font-mono text-xs text-primary">02</span> Ledger checks sum across
                all active sandboxes against the role daily cap.
              </li>
              <li>
                <span className="font-mono text-xs text-primary">03</span> Over-cap proposals are
                rejected with ranked resolution options before any hour is committed.
              </li>
            </ol>
            <p className="mt-4 rounded-md border border-border bg-elevated p-3 text-xs leading-relaxed text-muted-foreground">
              Bands: {utilizationBand(60)} &lt; 70% · {utilizationBand(80)} 80–89% ·{" "}
              {utilizationBand(95)} 90–100% · {utilizationBand(110)} &gt; 100% (blocked).
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
