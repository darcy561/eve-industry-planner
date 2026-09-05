const NODE_WIDTH = 248;
const NODE_HEIGHT = 80;
const H_GAP = 68;
const V_GAP = 152;
const MIN_NODE_GAP_X = 24;

function positionNudge(jobId, indexInRow, level) {
  let h = 0;
  for (let c = 0; c < jobId.length; c += 1) {
    h = (h * 31 + jobId.charCodeAt(c)) | 0;
  }
  const abs = Math.abs(h);
  const x = (abs % 80) - 40 + (indexInRow % 4) * 20 - 30;
  const y =
    (abs % 22) -
    11 +
    (indexInRow % 2) * 14 +
    level * 40;
  return { x, y };
}

/**
 * Enforces a minimum horizontal separation between nodes in the same visual row.
 * This keeps deterministic jitter while avoiding card overlaps.
 *
 * @param {import("@xyflow/react").Node[]} rowNodes
 * @param {number} nodeW
 * @param {number} minGap
 */
function preventRowOverlaps(rowNodes, nodeW, minGap) {
  if (!rowNodes || rowNodes.length < 2) return;
  const sorted = [...rowNodes].sort((a, b) => a.position.x - b.position.x);
  const beforeMin = sorted[0].position.x;
  const beforeMax = sorted[sorted.length - 1].position.x;
  const beforeMid = (beforeMin + beforeMax) / 2;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const minX = prev.position.x + nodeW + minGap;
    if (cur.position.x < minX) {
      cur.position.x = minX;
    }
  }

  const afterMin = sorted[0].position.x;
  const afterMax = sorted[sorted.length - 1].position.x;
  const afterMid = (afterMin + afterMax) / 2;
  const reCenterDelta = beforeMid - afterMid;
  if (reCenterDelta !== 0) {
    for (const n of sorted) {
      n.position.x += reCenterDelta;
    }
  }
}

/**
 * @param {import("@xyflow/react").Edge} e
 */
function pathOptionsForEdge(e) {
  const s = `${e.source}|${e.target}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const abs = Math.abs(h);
  const spread = (abs % 15) - 7;
  return {
    offset: spread * 11,
    borderRadius: 10 + (abs % 7) * 5,
  };
}

/**
 * @param {import("@xyflow/react").Edge[]} edges
 */
function assignEdgePathSpread(edges) {
  edges.forEach((e) => {
    e.pathOptions = pathOptionsForEdge(e);
  });
}

/**
 * Child (source) uses top handle; parent (target) uses bottom handle — same as {@link JobDependencyNode}.
 * The smooth-step path uses a horizontal “rung” between gapped points; we pick a rung Y that does not
 * cut through other node bodies.
 *
 * @param {import("@xyflow/react").Node[]} nodes
 * @param {import("@xyflow/react").Edge[]} edges
 * @param {number} nodeW
 * @param {number} nodeH
 */
function assignEdgeRungYAvoidingNodes(nodes, edges, nodeW, nodeH) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const all = nodes;

  function nodeBlocksRung(n, rungY, x0, x1) {
    const L = n.position.x;
    const T = n.position.y;
    const R = L + (n.width ?? nodeW);
    const B = T + (n.height ?? nodeH);
    if (rungY <= T || rungY >= B) return false;
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    return !(b <= L || a >= R);
  }

  const stepCandidates = [
    0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8, 0.35, 0.65, 0.45, 0.55, 0.15, 0.85,
  ];

  for (const e of edges) {
    const sNode = byId.get(e.source);
    const tNode = byId.get(e.target);
    if (!sNode || !tNode) continue;

    const o = Math.max(8, Math.abs(e.pathOptions?.offset ?? 40));
    const sx = sNode.position.x + nodeW / 2;
    const sy = sNode.position.y;
    const tx = tNode.position.x + nodeW / 2;
    const ty = tNode.position.y + nodeH;
    // Top (source) gapped up, bottom (target) gapped down — matches @xyflow getPoints
    const gsy = sy - o;
    const gty = ty + o;
    if (Math.abs(gsy - gty) < 1e-3) continue;

    const x0 = sx;
    const x1 = tx;
    const exclude = new Set([e.source, e.target]);

    let chosen = null;
    for (const sp of stepCandidates) {
      const rungY = gsy + (gty - gsy) * sp;
      let clear = true;
      for (const n of all) {
        if (exclude.has(n.id)) continue;
        if (nodeBlocksRung(n, rungY, x0, x1)) {
          clear = false;
          break;
        }
      }
      if (clear) {
        chosen = rungY;
        break;
      }
    }

    if (chosen != null) {
      e.pathOptions = { ...e.pathOptions, centerY: chosen };
    }
  }
}

/**
 * Builds React Flow nodes and edges from jobs that expose `childJobIDs` / `parentJobIDs`.
 *
 * @param {import("../../Classes/job").default[]} jobs
 * @param {ReadonlySet<string> | Set<string> | null | undefined} completeJobIds — optional “marked complete” ids
 * @returns {{ nodes: import("@xyflow/react").Node[]; edges: import("@xyflow/react").Edge[] }}
 */
export function buildJobDependencyFlowElements(jobs, completeJobIds) {
  const jobById = new Map(jobs.map((j) => [j.jobID, j]));
  const ids = new Set(jobById.keys());
  const complete =
    completeJobIds && typeof completeJobIds.has === "function"
      ? completeJobIds
      : new Set();

  /** @type {import("@xyflow/react").Edge[]} */
  const edges = [];
  const edgeKey = new Set();

  /** @param {string} childId @param {string} parentId */
  function addChildParentEdge(childId, parentId) {
    if (childId === parentId) return;
    if (!ids.has(childId) || !ids.has(parentId)) return;
    const ek = `${childId}->${parentId}`;
    if (edgeKey.has(ek)) return;
    edgeKey.add(ek);
    const sourceJ = jobById.get(childId);
    const targetJ = jobById.get(parentId);
    edges.push({
      id: ek,
      source: childId,
      target: parentId,
      sourceHandle: "to-parent",
      targetHandle: "from-children",
      type: "jobTypeGradient",
      data: {
        sourceJobType: sourceJ?.jobType,
        targetJobType: targetJ?.jobType,
      },
    });
  }

  for (const parentJob of jobs) {
    for (const rawChildId of parentJob.childJobIDs) {
      addChildParentEdge(String(rawChildId), parentJob.jobID);
    }
  }

  for (const job of jobs) {
    for (const pid of job.parentJobIDs) {
      addChildParentEdge(job.jobID, String(pid));
    }
  }

  assignEdgePathSpread(edges);

  /** @type {Map<string, number>} */
  const level = new Map();
  for (const id of ids) level.set(id, 0);

  let changed = true;
  let guard = 0;
  const maxIter = Math.max(ids.size + 2, 8);
  while (changed && guard < maxIter) {
    changed = false;
    guard += 1;
    for (const job of jobs) {
      const parents = job
        .parentJobIDs
        .filter((p) => ids.has(p));
      if (parents.length === 0) continue;
      const next =
        1 + Math.max(...parents.map((p) => level.get(p) ?? 0), 0);
      const cur = level.get(job.jobID) ?? 0;
      if (next > cur) {
        level.set(job.jobID, next);
        changed = true;
      }
    }
  }

  /** @type {Map<number, import("../../Classes/job").default[]>} */
  const byLevel = new Map();
  let maxLevel = 0;
  for (const job of jobs) {
    const lv = level.get(job.jobID) ?? 0;
    maxLevel = Math.max(maxLevel, lv);
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv).push(job);
  }

  /** @type {import("@xyflow/react").Node[]} */
  const nodes = [];
  for (let lv = 0; lv <= maxLevel; lv += 1) {
    const row = (byLevel.get(lv) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    /** @type {import("@xyflow/react").Node[]} */
    const rowNodes = [];
    const rowW = row.length * (NODE_WIDTH + H_GAP) - H_GAP;
    const startX = -rowW / 2;
    row.forEach((job, i) => {
      const { x: nx, y: ny } = positionNudge(job.jobID, i, lv);
      const esiCount = job.esiJobIDs.size;
      const readyToBuild = job.isReadyToStart;
      rowNodes.push({
        id: job.jobID,
        type: "jobDependency",
        position: {
          x: startX + i * (NODE_WIDTH + H_GAP) + nx,
          y: lv * (NODE_HEIGHT + V_GAP) + ny,
        },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: {
          label: job.name,
          itemID: job.itemID,
          jobType: job.jobType,
          esiCount,
          isComplete: complete.has(String(job.jobID)),
          readyToBuild,
        },
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      });
    });
    preventRowOverlaps(rowNodes, NODE_WIDTH, MIN_NODE_GAP_X);
    nodes.push(...rowNodes);
  }

  assignEdgeRungYAvoidingNodes(nodes, edges, NODE_WIDTH, NODE_HEIGHT);

  return { nodes, edges };
}

/**
 * Jobs linked to `emphasisId` via parent/child fields (both directions), restricted to `jobs`.
 *
 * @param {string|null|undefined} emphasisId
 * @param {import("../../Classes/job").default[]} jobs
 * @returns {Set<string>|null}
 */
export function relatedJobIdsInJobTree(emphasisId, jobs) {
  if (!emphasisId || !jobs.length) return null;
  const idSet = new Set(jobs.map((j) => String(j.jobID)));
  const eid = String(emphasisId);
  const focal = jobs.find((j) => String(j.jobID) === eid);
  const rel = new Set([eid]);
  if (!focal) return rel;

  for (const pid of focal.parentJobIDs) {
    const p = String(pid);
    if (idSet.has(p)) rel.add(p);
  }
  for (const cid of focal.childJobIDs) {
    const c = String(cid);
    if (idSet.has(c)) rel.add(c);
  }
  for (const j of jobs) {
    const jid = String(j.jobID);
    const children = j.childJobIDs.map(String);
    if (children.includes(eid)) {
      rel.add(jid);
    }
    const parents = j.parentJobIDs.map(String);
    if (parents.includes(eid)) {
      rel.add(jid);
    }
  }
  return rel;
}
