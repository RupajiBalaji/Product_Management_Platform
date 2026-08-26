import { cn } from "@/lib/utils";
import type { Project } from "@/lib/platform-data";

export function GanttChart({ project, compact = false }: { project: Project; compact?: boolean }) {
  const weeks = project.weeks;
  const weekCols = Array.from({ length: weeks }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto">
      <div
        className="min-w-[640px]"
        style={{ gridTemplateColumns: `220px repeat(${weeks}, minmax(48px, 1fr))` }}
      >
        <div
          className="grid border-b border-border pb-2"
          style={{ gridTemplateColumns: `220px repeat(${weeks}, minmax(48px, 1fr))` }}
        >
          <span className="text-eyebrow">Phase / Workstream</span>
          {weekCols.map((w) => (
            <span key={w} className="text-center font-mono text-[10px] text-muted-foreground">
              W{w}
            </span>
          ))}
        </div>
        {project.phases.map((phase) => {
          const pct = (v: number) => `${((v - 1) / weeks) * 100}%`;
          const width = `${((phase.endWeek - phase.startWeek + 1) / weeks) * 100}%`;
          return (
            <div
              key={phase.id}
              className="grid items-center border-b border-border/60 py-3 last:border-b-0"
              style={{ gridTemplateColumns: `220px repeat(${weeks}, minmax(48px, 1fr))` }}
            >
              <div className="pr-4">
                <p className="truncate text-sm font-medium text-foreground">{phase.name}</p>
                {!compact && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {phase.lead} · <span className="text-accent">{phase.milestone}</span>
                  </p>
                )}
              </div>
              <div className="relative col-span-full h-6" style={{ gridColumn: `2 / ${weeks + 2}` }}>
                <div
                  className="absolute top-0 h-6 rounded-md border border-primary/30 bg-primary/15"
                  style={{ left: pct(phase.startWeek), width }}
                >
                  <div
                    className={cn(
                      "h-full rounded-md",
                      phase.progress === 100 ? "bg-success/70" : "bg-primary/60",
                    )}
                    style={{ width: `${phase.progress}%` }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-primary-foreground mix-blend-difference">
                    {phase.progress}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
