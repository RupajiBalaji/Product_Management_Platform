/**
 * Directed Acyclic Graph (DAG) Cycle Detection for Task Dependencies
 *
 * Implements Depth-First Search (DFS) with recursive back-tracking
 * using three-color vertex coloring:
 * - Unvisited (white)
 * - Visiting / on current recursion stack (gray)
 * - Fully explored / Visited (black)
 */

/**
 * Pure function to detect cycles in an in-memory adjacency list
 * @param {Map<string, string[]>|Record<string, string[]>} adjacencyMap Map of taskId -> array of dependency taskIds
 * @param {string} startTaskId The task where the dependency change occurred
 * @returns {{ hasCycle: boolean, path?: string[] }}
 */
function detectCycleInGraph(adjacencyMap, startTaskId) {
  const startId = String(startTaskId);

  // Normalize map to Map<string, string[]>
  const graph = adjacencyMap instanceof Map
    ? adjacencyMap
    : new Map(Object.entries(adjacencyMap));

  // Check trivial self-dependency first
  const immediateDeps = graph.get(startId) || [];
  if (immediateDeps.map(String).includes(startId)) {
    return { hasCycle: true, path: [startId, startId] };
  }

  const visiting = new Set();
  const visited = new Set();
  const path = [];

  function dfs(currId) {
    visiting.add(currId);
    path.push(currId);

    const neighbors = graph.get(currId) || [];
    for (const rawNeighbor of neighbors) {
      const neighborId = String(rawNeighbor);

      // Self-loop on neighbor
      if (neighborId === currId) {
        return [currId, currId];
      }

      // Back-edge found -> Cycle detected!
      if (visiting.has(neighborId)) {
        const cycleStartIndex = path.indexOf(neighborId);
        if (cycleStartIndex !== -1) {
          return [...path.slice(cycleStartIndex), neighborId];
        }
        return [...path, neighborId];
      }

      // If not yet visited, continue DFS
      if (!visited.has(neighborId)) {
        const cycleFound = dfs(neighborId);
        if (cycleFound) return cycleFound;
      }
    }

    // Finished exploring currId
    path.pop();
    visiting.delete(currId);
    visited.add(currId);
    return null;
  }

  // Run DFS from the starting task
  const cyclePath = dfs(startId);
  if (cyclePath) {
    return { hasCycle: true, path: cyclePath };
  }

  return { hasCycle: false };
}

/**
 * Check if proposing `proposedDependsOn` for `taskId` creates a cycle in the project
 * @param {string} taskId
 * @param {string[]} proposedDependsOn
 * @param {string|Array<{ _id: string, depends_on: string[] }>} projectIdOrTasks
 * @returns {Promise<{ hasCycle: boolean, path?: string[] }>}
 */
async function checkForCycle(taskId, proposedDependsOn, projectIdOrTasks) {
  const normTaskId = String(taskId);
  const normProposed = (proposedDependsOn || []).map((id) => String(id));

  // Immediate self-dependency check
  if (normProposed.includes(normTaskId)) {
    return { hasCycle: true, path: [normTaskId, normTaskId] };
  }

  let tasks = [];
  if (Array.isArray(projectIdOrTasks)) {
    // Pure in-memory task list (used for isolated unit testing)
    tasks = projectIdOrTasks;
  } else {
    // Fetch from MongoDB
    const { Task } = require("../models/models");
    tasks = await Task.find({ project_id: projectIdOrTasks }, "_id title depends_on").lean();
  }

  // Build adjacency map: taskId -> [depends_on IDs]
  const adjacencyMap = new Map();
  for (const t of tasks) {
    const id = String(t._id || t.id);
    const deps = (t.depends_on || []).map((d) => String(d._id || d));
    adjacencyMap.set(id, deps);
  }

  // Apply proposed dependencies for taskId
  adjacencyMap.set(normTaskId, normProposed);

  // Run cycle detector starting from taskId
  return detectCycleInGraph(adjacencyMap, normTaskId);
}

module.exports = {
  detectCycleInGraph,
  checkForCycle,
};
