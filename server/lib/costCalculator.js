/**
 * Pure Logic Module: Budget, Cost, and Portfolio Health Calculations (Phase 8)
 *
 * Single source of truth for portfolio-level financial and health analytics.
 * STRICT REQUIREMENT: Zero database dependencies (100% pure computational logic).
 */

/**
 * calculateProjectCost(teamAllocations, hourlyRatesByUserId)
 * Computes the total budgeted resource cost for a project based on team allocations and rates.
 *
 * @param {Array<{ userId?: string, user_id?: string, dailyHours?: number, daily_hours?: number, totalProjectHours?: number, totalHours?: number, total_hours?: number }>} teamAllocations
 * @param {Record<string, number>} hourlyRatesByUserId - Map of userId to hourly rate in USD
 * @returns {{ totalBudgetedCost: number, breakdown: Array<{ userId: string, totalHours: number, rate: number, cost: number }> }}
 */
function calculateProjectCost(teamAllocations = [], hourlyRatesByUserId = {}) {
  const breakdown = [];
  let totalBudgetedCost = 0;

  if (!Array.isArray(teamAllocations)) {
    return { totalBudgetedCost: 0, breakdown: [] };
  }

  for (const alloc of teamAllocations) {
    if (!alloc) continue;
    const userId = String(alloc.userId || alloc.user_id || "");
    const totalHours = Number(
      alloc.totalProjectHours !== undefined
        ? alloc.totalProjectHours
        : alloc.totalHours !== undefined
        ? alloc.totalHours
        : alloc.total_hours !== undefined
        ? alloc.total_hours
        : (alloc.dailyHours || alloc.daily_hours || 0) * 20
    );

    const rate = Number(hourlyRatesByUserId?.[userId] || 0);
    const cost = Math.round(totalHours * rate * 100) / 100;

    totalBudgetedCost += cost;
    breakdown.push({
      userId,
      totalHours,
      rate,
      cost,
    });
  }

  return {
    totalBudgetedCost: Math.round(totalBudgetedCost * 100) / 100,
    breakdown,
  };
}

/**
 * calculateBudgetBurn(budgetedCost, actualHoursLoggedByUser, hourlyRatesByUserId, currentVelocity, totalEstimatedHours, totalHoursCompleted)
 * Computes the actual cost burned, remaining budget, extrapolated final cost, and health status.
 *
 * Threshold Rules:
 *  - "green": projectedFinalCost <= budgetedCost * 1.05 (up to 5% buffer)
 *  - "yellow": budgetedCost * 1.05 < projectedFinalCost <= budgetedCost * 1.15 (5% to 15% buffer)
 *  - "red": projectedFinalCost > budgetedCost * 1.15 (> 15% over budget)
 *
 * @param {number} budgetedCost - Authorized project budget
 * @param {Record<string, number> | Array<{ userId?: string, user_id?: string, hours?: number, logged_hours?: number }>} actualHoursLoggedByUser
 * @param {Record<string, number>} hourlyRatesByUserId - Map of userId to hourly rate
 * @param {number} [currentVelocity=1.0] - Ratio of completed work to elapsed effort (1.0 = on schedule)
 * @param {number} [totalEstimatedHours=0] - Total estimated hours across all project tasks
 * @param {number} [totalHoursCompleted=0] - Estimated hours of tasks that are completed
 * @returns {{ actualCostBurned: number, remainingBudget: number, projectedFinalCost: number, burnPct: number, status: "green" | "yellow" | "red" }}
 */
function calculateBudgetBurn(
  budgetedCost = 0,
  actualHoursLoggedByUser = {},
  hourlyRatesByUserId = {},
  currentVelocity = 1.0,
  totalEstimatedHours = 0,
  totalHoursCompleted = 0
) {
  const budget = Number(budgetedCost) || 0;
  let actualCostBurned = 0;
  let totalActualHours = 0;

  if (Array.isArray(actualHoursLoggedByUser)) {
    for (const item of actualHoursLoggedByUser) {
      if (!item) continue;
      const uId = String(item.userId || item.user_id || "");
      const hrs = Number(item.hours !== undefined ? item.hours : item.logged_hours || 0);
      const rate = Number(hourlyRatesByUserId?.[uId] || 0);
      actualCostBurned += hrs * rate;
      totalActualHours += hrs;
    }
  } else if (actualHoursLoggedByUser && typeof actualHoursLoggedByUser === "object") {
    for (const [uId, hrsVal] of Object.entries(actualHoursLoggedByUser)) {
      const hrs = Number(hrsVal || 0);
      const rate = Number(hourlyRatesByUserId?.[uId] || 0);
      actualCostBurned += hrs * rate;
      totalActualHours += hrs;
    }
  }

  actualCostBurned = Math.round(actualCostBurned * 100) / 100;
  const remainingBudget = Math.round((budget - actualCostBurned) * 100) / 100;

  // Average rate calculation
  let avgRate = 0;
  if (totalActualHours > 0) {
    avgRate = actualCostBurned / totalActualHours;
  } else {
    const rateValues = Object.values(hourlyRatesByUserId || {}).map(Number).filter((r) => r > 0);
    avgRate = rateValues.length > 0 ? rateValues.reduce((a, b) => a + b, 0) / rateValues.length : 0;
  }

  // Projection logic
  let projectedFinalCost = actualCostBurned;
  const estHours = Number(totalEstimatedHours) || 0;
  const compHours = Number(totalHoursCompleted) || 0;
  const velocity = Number(currentVelocity) > 0 ? Number(currentVelocity) : 1.0;

  if (estHours > 0) {
    const remainingEstimatedHours = Math.max(0, estHours - compHours);
    const adjustedRemainingHours = remainingEstimatedHours / velocity;
    const projectedAdditionalCost = adjustedRemainingHours * avgRate;
    projectedFinalCost = Math.round((actualCostBurned + projectedAdditionalCost) * 100) / 100;
  } else if (budget > 0 && actualCostBurned === 0) {
    projectedFinalCost = budget;
  }

  const burnPct = budget > 0 ? Math.round((actualCostBurned / budget) * 1000) / 10 : 0;

  // Status determination with precise thresholds:
  // green: <= budgetedCost * 1.05
  // yellow: <= budgetedCost * 1.15
  // red: otherwise
  let status = "green";
  const greenThreshold = budget * 1.05;
  const yellowThreshold = budget * 1.15;

  if (projectedFinalCost <= greenThreshold + 0.0001) {
    status = "green";
  } else if (projectedFinalCost <= yellowThreshold + 0.0001) {
    status = "yellow";
  } else {
    status = "red";
  }

  return {
    actualCostBurned,
    remainingBudget,
    projectedFinalCost,
    burnPct,
    status,
  };
}

/**
 * calculateProjectHealth(slippageEventsUnresolved, tasksOverEstimate, budgetStatus)
 * Evaluates the composite health traffic-light status for a project.
 *
 * Rules:
 *  - "green": no unresolved escalation-level slippage AND budget status is green (and no warning slippage / no 50%+ over estimate tasks)
 *  - "yellow": any warning-level slippage OR budget status is yellow OR any task 50%+ over estimate
 *  - "red": any escalation-level unresolved slippage OR budget status is red
 *
 * @param {Array<any>} slippageEventsUnresolved - Unresolved SlippageEvent records or level strings
 * @param {Array<any> | number} tasksOverEstimate - Tasks that exceeded estimate by 50%+ or count of such tasks
 * @param {"green" | "yellow" | "red" | string} [budgetStatus="green"] - Current budget status from calculateBudgetBurn
 * @returns {{ health: "green" | "yellow" | "red", reasons: string[] }}
 */
function calculateProjectHealth(slippageEventsUnresolved = [], tasksOverEstimate = 0, budgetStatus = "green") {
  const reasons = [];

  // 1. Analyze unresolved slippage events
  const unresolvedList = Array.isArray(slippageEventsUnresolved) ? slippageEventsUnresolved : [];
  const escalationEvents = unresolvedList.filter((e) => {
    if (!e) return false;
    if (typeof e === "string") return e.toLowerCase() === "escalation";
    return e.level === "escalation";
  });

  const warningEvents = unresolvedList.filter((e) => {
    if (!e) return false;
    if (typeof e === "string") return e.toLowerCase() === "warning";
    return e.level === "warning";
  });

  if (escalationEvents.length > 0) {
    reasons.push(`${escalationEvents.length} unresolved escalation-level slippage event(s) requiring immediate intervention`);
  }

  // 2. Analyze budget status
  const normalizedBudgetStatus = String(budgetStatus || "green").toLowerCase();
  if (normalizedBudgetStatus === "red") {
    reasons.push("Critical budget overrun: Projected final cost exceeds 115% of authorized budget");
  }

  // 3. Analyze warning-level slippage
  if (warningEvents.length > 0) {
    reasons.push(`${warningEvents.length} warning-level slippage streak(s) detected`);
  }

  // 4. Analyze budget status warning
  if (normalizedBudgetStatus === "yellow") {
    reasons.push("Budget warning: Projected final cost is trending 5% to 15% above authorized budget");
  }

  // 5. Analyze tasks 50%+ over estimate
  let overEstimateCount = 0;
  if (typeof tasksOverEstimate === "number") {
    overEstimateCount = Math.max(0, tasksOverEstimate);
  } else if (Array.isArray(tasksOverEstimate)) {
    overEstimateCount = tasksOverEstimate.filter((t) => {
      if (!t) return false;
      if (typeof t === "object") {
        if (t.isOverEstimate !== undefined) return Boolean(t.isOverEstimate);
        const logged = Number(t.logged_hours || t.loggedHours || 0);
        const est = Number(t.estimate_hours || t.estimateHours || 0);
        return est > 0 ? logged >= est * 1.5 : logged > 0;
      }
      return true;
    }).length;
  }

  if (overEstimateCount > 0) {
    reasons.push(`${overEstimateCount} task(s) have exceeded original estimate by 50% or more`);
  }

  // 6. Determine composite health
  let health = "green";
  if (escalationEvents.length > 0 || normalizedBudgetStatus === "red") {
    health = "red";
  } else if (warningEvents.length > 0 || normalizedBudgetStatus === "yellow" || overEstimateCount > 0) {
    health = "yellow";
  } else {
    health = "green";
    if (reasons.length === 0) {
      reasons.push("Project is on track and within budget thresholds.");
    }
  }

  return {
    health,
    reasons,
  };
}

/**
 * calculateCostDelta(hoursDelta, hourlyRate)
 * Formats scope change cost impact into executive representation: "+45 hours × $120/hr = +$5,400"
 *
 * @param {number} hoursDelta - Additional or reduced hours
 * @param {number} [hourlyRate=0] - Contributor's hourly cost rate
 * @returns {{ hoursDelta: number, hourlyRate: number, costDelta: number, formatted: string }}
 */
function calculateCostDelta(hoursDelta = 0, hourlyRate = 0) {
  const hours = Number(hoursDelta) || 0;
  const rate = Number(hourlyRate) || 0;
  const costDelta = Math.round(hours * rate * 100) / 100;

  const hoursSign = hours >= 0 ? "+" : "-";
  const absHours = Math.abs(hours);
  const costSign = costDelta >= 0 ? "+" : "-";
  const absCost = Math.abs(costDelta).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const formatted = `${hoursSign}${absHours} hours × $${rate}/hr = ${costSign}$${absCost}`;

  return {
    hoursDelta: hours,
    hourlyRate: rate,
    costDelta,
    formatted,
  };
}

module.exports = {
  calculateProjectCost,
  calculateBudgetBurn,
  calculateProjectHealth,
  calculateCostDelta,
};
