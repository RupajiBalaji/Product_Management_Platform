// ─── Project Priority Constants (Phase 3 – P1/P2/P3 Governance Model) ─────────
//
// P1 = Mission-Critical  (revenue-impacting, client-facing deadlines, hard stops)
// P2 = High-Value        (important, but timeline can shift slightly)
// P3 = Strategic         (long-term bets, no hard deadline right now)
//
// Single source of truth — used across all UI components and type system.

export type ProjectPriority = "P1" | "P2" | "P3";

export const PRIORITY_ORDER: ProjectPriority[] = ["P1", "P2", "P3"];

/** Numeric weight — higher = more urgent (used for sorting) */
export const PRIORITY_WEIGHT: Record<ProjectPriority, number> = {
  P1: 3,
  P2: 2,
  P3: 1,
};

/** Human-readable description label */
export const PRIORITY_LABEL: Record<ProjectPriority, string> = {
  P1: "Mission-Critical",
  P2: "High-Value",
  P3: "Strategic",
};

/** Short display badge text */
export const PRIORITY_SHORT: Record<ProjectPriority, string> = {
  P1: "⚡ P1 — Mission-Critical",
  P2: "🔥 P2 — High-Value",
  P3: "📌 P3 — Strategic",
};

/** Tailwind styles per priority level */
export const PRIORITY_STYLES: Record<
  ProjectPriority,
  {
    label: string;
    shortLabel: string;
    bg: string;
    text: string;
    border: string;
    tone: string;
    badge: string;
    icon: string;
  }
> = {
  P1: {
    label: "⚡ P1 — Mission-Critical",
    shortLabel: "P1 Mission-Critical",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/40",
    tone: "text-red-400",
    badge: "border-red-500/40 bg-red-500/15 text-red-300 font-bold",
    icon: "⚡",
  },
  P2: {
    label: "🔥 P2 — High-Value",
    shortLabel: "P2 High-Value",
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/40",
    tone: "text-amber-400",
    badge: "border-amber-500/40 bg-amber-500/15 text-amber-300 font-bold",
    icon: "🔥",
  },
  P3: {
    label: "📌 P3 — Strategic",
    shortLabel: "P3 Strategic",
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/30",
    tone: "text-blue-400",
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    icon: "📌",
  },
};

/** Returns true if priority is P1 or P2 (elevated) */
export function isElevatedPriority(priority: string | undefined): boolean {
  return priority === "P1" || priority === "P2";
}

/** Normalise legacy values or unknown strings to valid P1/P2/P3 */
export function normalizePriority(priority: string | undefined | null): ProjectPriority {
  if (!priority) return "P2";
  if (priority === "P1" || priority === "P2" || priority === "P3") return priority as ProjectPriority;
  // Legacy mapping
  if (priority === "critical") return "P1";
  if (priority === "high") return "P1";
  if (priority === "medium") return "P2";
  if (priority === "low") return "P3";
  return "P2";
}

/** Sort comparator — P1 first (descending urgency) */
export function comparePriority(a: ProjectPriority, b: ProjectPriority): number {
  return PRIORITY_WEIGHT[b] - PRIORITY_WEIGHT[a];
}
