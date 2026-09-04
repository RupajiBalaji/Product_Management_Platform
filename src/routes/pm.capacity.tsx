import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCapacityDashboard } from "@/lib/db";
import type { EmployeeCapacity } from "@/lib/types";
import { PRIORITY_STYLES, normalizePriority } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm/capacity")({
  component: CapacityPage,
});

function CapacityPage() {
  const [capacities, setCapacities] = useState<EmployeeCapacity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOverCapacity, setFilterOverCapacity] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getCapacityDashboard();
      setCapacities(data);
    } catch (err) {
      console.error("Failed to load capacity data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalEmployees = capacities.length;
  const overAllocatedCount = capacities.filter((c) => c.isOverAllocated).length;
  const optimalCount = capacities.filter((c) => !c.isOverAllocated && c.totalDailyHours > 0).length;
  const unallocatedCount = capacities.filter((c) => c.totalDailyHours === 0).length;
  const avgUtilization =
    totalEmployees > 0
      ? Math.round(capacities.reduce((acc, c) => acc + c.utilizationPct, 0) / totalEmployees)
      : 0;

  const filteredCapacities = capacities.filter((c) => {
    const matchesSearch =
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.userId || "").toLowerCase().includes(search.toLowerCase());
    if (filterOverCapacity) {
      return matchesSearch && c.isOverAllocated;
    }
    return matchesSearch;
  });

  return (
    <AppShell
      eyebrow="Phase 3 Governance · Global Resource Registry"
      title="Global Capacity & Allocation Ledger"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      {/* Top Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <div className="panel p-5 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-eyebrow text-[10px]">Total Monitored Workforce</span>
            <Users className="size-4 text-primary" />
          </div>
          <div className="font-display text-2xl font-bold text-foreground">{totalEmployees}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Active team contributors</p>
        </div>

        <div className="panel p-5 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-eyebrow text-[10px]">Over-Allocated Warnings</span>
            <ShieldAlert className="size-4 text-destructive" />
          </div>
          <div className="font-display text-2xl font-bold text-destructive">{overAllocatedCount}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Exceeding max daily capacity cap</p>
        </div>

        <div className="panel p-5 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-eyebrow text-[10px]">Optimal Allocations</span>
            <CheckCircle2 className="size-4 text-success" />
          </div>
          <div className="font-display text-2xl font-bold text-success">{optimalCount}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Balanced workload within cap</p>
        </div>

        <div className="panel p-5 bg-card">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-eyebrow text-[10px]">Avg Organization Utilization</span>
            <Gauge className="size-4 text-amber-400" />
          </div>
          <div className="font-display text-2xl font-bold text-foreground">{avgUtilization}%</div>
          <p className="text-[11px] text-muted-foreground mt-1">Portfolio-wide hour utilization</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="panel p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 bg-card">
        <div className="relative w-full sm:w-80">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search contributor name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-input bg-elevated pl-9 pr-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setFilterOverCapacity(!filterOverCapacity)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors cursor-pointer border",
              filterOverCapacity
                ? "border-destructive/50 bg-destructive/15 text-destructive font-bold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            <AlertTriangle className="size-3.5" />
            <span>Over-Allocated Only ({overAllocatedCount})</span>
          </button>
        </div>
      </div>

      {/* Capacity Table */}
      {loading ? (
        <div className="panel p-12 flex flex-col items-center justify-center text-center">
          <Loader2 className="size-8 animate-spin text-primary mb-3" />
          <p className="text-xs text-muted-foreground">Calculating portfolio capacity ledger...</p>
        </div>
      ) : filteredCapacities.length === 0 ? (
        <div className="panel p-12 text-center text-muted-foreground">
          <Activity className="size-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="font-semibold text-foreground">No employees match the filter</p>
          <p className="text-xs mt-1">Try changing your search keywords or toggle off filter.</p>
        </div>
      ) : (
        <div className="panel overflow-hidden border-border/80 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
                  <th className="py-3 px-4 font-semibold">Contributor</th>
                  <th className="py-3 px-4 font-semibold">Daily Allocation</th>
                  <th className="py-3 px-4 font-semibold">Capacity Cap</th>
                  <th className="py-3 px-4 font-semibold">Utilization</th>
                  <th className="py-3 px-4 font-semibold">Active Commitments</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredCapacities.map((item) => {
                  const isOver = item.isOverAllocated;
                  const utilColor =
                    item.utilizationPct > 100
                      ? "bg-destructive text-destructive-foreground"
                      : item.utilizationPct >= 80
                      ? "bg-warning text-warning-foreground"
                      : "bg-success text-success-foreground";

                  const barColor =
                    item.utilizationPct > 100
                      ? "bg-destructive"
                      : item.utilizationPct >= 80
                      ? "bg-amber-400"
                      : "bg-success";

                  return (
                    <tr
                      key={item.userId}
                      className={cn(
                        "hover:bg-muted/10 transition-colors",
                        isOver && "bg-destructive/5"
                      )}
                    >
                      {/* Contributor info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-bold text-primary text-xs">
                            {(item.name || item.email || "U")
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">
                              {item.name || item.userId}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{item.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Daily hours */}
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            "font-mono font-bold text-sm",
                            isOver ? "text-destructive" : "text-foreground"
                          )}
                        >
                          {item.totalDailyHours} hrs/day
                        </span>
                      </td>

                      {/* Capacity cap */}
                      <td className="py-3.5 px-4 text-muted-foreground font-mono">
                        {item.dailyCap} hrs/day
                      </td>

                      {/* Utilization with progress bar */}
                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                          <span
                            className={cn(
                              "font-bold",
                              item.utilizationPct > 100
                                ? "text-destructive"
                                : item.utilizationPct >= 80
                                ? "text-amber-400"
                                : "text-success"
                            )}
                          >
                            {item.utilizationPct}%
                          </span>
                          {isOver && (
                            <span className="text-[9px] text-destructive font-bold flex items-center gap-0.5">
                              <ShieldAlert className="size-3" /> Over
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", barColor)}
                            style={{ width: `${Math.min(item.utilizationPct, 100)}%` }}
                          />
                        </div>
                      </td>

                      {/* Active Project Commitments */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2 py-0.5 text-[10px] font-mono font-medium">
                            <Layers className="size-3 text-primary" />
                            {item.projects?.length || 0} Projects
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to="/pm/employees/$employeeId"
                          params={{ employeeId: item.userId }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          <span>Inspect</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
