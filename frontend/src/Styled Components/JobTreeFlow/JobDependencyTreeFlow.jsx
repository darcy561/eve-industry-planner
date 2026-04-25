import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Box, Typography, useTheme } from "@mui/material";
import {
  buildJobDependencyFlowElements,
  relatedJobIdsInJobTree,
} from "./buildJobDependencyFlowElements";
import JobTypeGradientEdge from "./JobTypeGradientEdge";
import { JobDependencyNode } from "./JobDependencyNode";
import FitViewToJobEffect from "./FitViewToJobEffect";
import FitViewToGraphEffect from "./FitViewToGraphEffect";
import JobTreeLegend from "./JobTreeLegend";
import JobTreeControls from "./JobTreeControls";
import { JobTreeInteractionContext, noop } from "./jobTreeInteractionContext";
import { getJobTreeFlowCanvasSx } from "./jobTreeFlowCanvasSx";

const nodeTypes = { jobDependency: JobDependencyNode };
const edgeTypes = { jobTypeGradient: JobTypeGradientEdge };

function JobDependencyTreeFlowInner({
  jobs = [],
  completeJobIds,
  chainHighlightJobIds,
  initialFocusJobId,
  focusRequestKey,
  fitViewRequestKey,
  onJobDoubleClick,
  showHelpText = false,
  helpText,
  emptyLabel = "No jobs to display.",
  hideControls = false,
  hideLegend = false,
  onOpenInDialog,
  flowClassName = "job-dependency-tree-flow",
  minHeight = { xs: 360, md: 420 },
  interactionResetKey,
  sx,
}) {
  const theme = useTheme();

  const jobIdSet = useMemo(
    () => new Set(jobs.map((j) => String(j.jobID))),
    [jobs]
  );

  const layoutRevision = useMemo(
    () => jobs.map((j) => String(j.jobID)).join("\0"),
    [jobs]
  );

  const { nodes: baseNodes, edges: baseEdges } = useMemo(
    () => buildJobDependencyFlowElements(jobs, completeJobIds),
    [jobs, completeJobIds]
  );

  const [hoveredId, setHoveredId] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const fitSessionKey = useMemo(() => {
    if (initialFocusJobId == null || initialFocusJobId === "") return null;
    const id = String(initialFocusJobId);
    if (!jobIdSet.has(id)) return null;
    return `${id}::${String(focusRequestKey ?? "")}::${layoutRevision}`;
  }, [initialFocusJobId, focusRequestKey, jobIdSet, layoutRevision]);

  useLayoutEffect(() => {
    if (!fitSessionKey) return;
    const id = String(fitSessionKey.split("::")[0]);
    setSelectedJobId(id);
  }, [fitSessionKey]);

  useEffect(() => {
    if (!selectedJobId) return;
    if (!jobIdSet.has(String(selectedJobId))) {
      setSelectedJobId(null);
    }
  }, [jobs, jobIdSet, selectedJobId]);

  const prevInteractionResetKey = useRef(undefined);
  useEffect(() => {
    if (interactionResetKey === undefined) return;
    if (prevInteractionResetKey.current === undefined) {
      prevInteractionResetKey.current = interactionResetKey;
      return;
    }
    if (prevInteractionResetKey.current === interactionResetKey) return;
    prevInteractionResetKey.current = interactionResetKey;
    setHoveredId(null);
    setSelectedJobId(null);
  }, [interactionResetKey]);

  const emphasisId = hoveredId ?? selectedJobId;

  const panelChainIds = useMemo(() => {
    if (!chainHighlightJobIds || chainHighlightJobIds.size === 0) {
      return null;
    }
    const out = new Set();
    for (const id of chainHighlightJobIds) {
      const sid = String(id);
      if (jobIdSet.has(sid)) out.add(sid);
    }
    return out.size > 0 ? out : null;
  }, [chainHighlightJobIds, jobIdSet]);

  const relatedIds = useMemo(() => {
    if (panelChainIds) return panelChainIds;
    return relatedJobIdsInJobTree(emphasisId, jobs);
  }, [panelChainIds, emphasisId, jobs]);

  const displayNodes = useMemo(() => {
    return baseNodes.map((n) => {
      const inPanelChain =
        panelChainIds != null && panelChainIds.has(String(n.id));
      return {
        ...n,
        data: {
          ...n.data,
          focused: Boolean(
            inPanelChain ||
              (selectedJobId != null && String(n.id) === selectedJobId)
          ),
        },
        style: {
          ...n.style,
          opacity: relatedIds ? (relatedIds.has(String(n.id)) ? 1 : 0.28) : 1,
        },
      };
    });
  }, [baseNodes, panelChainIds, relatedIds, selectedJobId]);

  const displayEdges = useMemo(() => {
    const stroke = theme.palette.primary.main;
    const dimStroke = theme.palette.text.disabled;
    if (!relatedIds) {
      return baseEdges.map((e) => ({
        ...e,
        data: { ...e.data, edgeDimmed: false },
        style: {
          ...e.style,
          stroke,
          strokeWidth: 1.5,
          opacity: 1,
        },
        markerEnd: undefined,
      }));
    }
    return baseEdges.map((e) => {
      const on =
        relatedIds.has(String(e.source)) && relatedIds.has(String(e.target));
      return {
        ...e,
        data: { ...e.data, edgeDimmed: !on },
        className: on
          ? [e.className, "job-dependency-edge--pulse"].filter(Boolean).join(" ")
          : e.className,
        style: {
          ...e.style,
          stroke: on ? stroke : dimStroke,
          strokeWidth: on ? 2.75 : 1.25,
          opacity: on ? 1 : 0.2,
        },
        markerEnd: undefined,
        zIndex: on ? 2 : 0,
      };
    });
  }, [baseEdges, relatedIds, theme]);

  const onSelectNode = useCallback((id) => {
    setSelectedJobId(id != null && id !== "" ? String(id) : null);
  }, []);

  const onOpenNode = useCallback(
    (jobID) => {
      (onJobDoubleClick ?? noop)(jobID);
    },
    [onJobDoubleClick]
  );

  const interaction = useMemo(
    () => ({ onSelectNode, onOpenNode }),
    [onSelectNode, onOpenNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedJobId(null);
    setHoveredId(null);
  }, []);

  const onNodeMouseEnter = useCallback((_evt, node) => {
    setHoveredId(
      node != null && node.id != null && node.id !== "" ? String(node.id) : null
    );
  }, []);

  const onPaneMouseEnter = useCallback(() => {
    setHoveredId(null);
  }, []);

  if (jobs.length === 0) {
    return (
      <Box sx={{ p: 2, ...sx }}>
        <Typography color="text.secondary">{emptyLabel}</Typography>
      </Box>
    );
  }

  const defaultHelp = (
    <Typography variant="subtitle2" color="text.secondary">
      Built jobs feed <strong>up</strong> the chain; layout is top-down. Lines run from child to
      parent. <strong>Click</strong> a job to lock highlight for its parents and children;{" "}
      <strong>double-click</strong> runs your handler when provided. Pan: drag the canvas or
      two-finger scroll; zoom: toolbar, pinch, or <strong>Ctrl</strong> / <strong>⌘</strong> + scroll.
    </Typography>
  );

  return (
    <JobTreeInteractionContext.Provider value={interaction}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          height: "100%",
          ...sx,
        }}
      >
        {showHelpText && (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderBottom: 1,
              borderColor: "divider",
              flexShrink: 0,
            }}
          >
            {helpText ?? defaultHelp}
          </Box>
        )}
        <Box
          className={flowClassName}
          onMouseLeave={() => setHoveredId(null)}
          sx={getJobTreeFlowCanvasSx(theme, minHeight)}
        >
          {!hideLegend ? <JobTreeLegend /> : null}
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable={false}
            selectionOnDrag={false}
            selectNodesOnDrag={false}
            panOnScroll
            zoomOnScroll
            zoomOnPinch
            panOnDrag
            zoomOnDoubleClick={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.28, maxZoom: 1.35 }}
            minZoom={0.12}
            maxZoom={1.75}
            proOptions={{ hideAttribution: true }}
            onPaneClick={onPaneClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onPaneMouseEnter={onPaneMouseEnter}
            elevateEdgesOnSelect
          >
            {fitSessionKey ? <FitViewToJobEffect fitSessionKey={fitSessionKey} /> : null}
            {fitViewRequestKey !== undefined ? (
              <FitViewToGraphEffect fitViewRequestKey={fitViewRequestKey} />
            ) : null}
            {!hideControls ? <JobTreeControls onOpenInDialog={onOpenInDialog} /> : null}
          </ReactFlow>
        </Box>
      </Box>
    </JobTreeInteractionContext.Provider>
  );
}

/**
 * Reusable parent/child job graph (React Flow). Pass canonical `Job` instances (or compatible objects
 * with `jobID`, `name`, `getAllChildJobs`, `getParentJobIds`, etc.).
 *
 * Wrap with `ReactFlowProvider` is included in the default export.
 *
 * @param {object} props
 * @param {import("../../Classes/job").default[]} props.jobs
 * @param {ReadonlySet<string>|Set<string>|null|undefined} [props.completeJobIds]
 * @param {ReadonlySet<string>|Set<string>|null|undefined} [props.chainHighlightJobIds] — non-empty: dim outside set; these nodes get “selected” ring/pulse
 * @param {string|number|null|undefined} [props.initialFocusJobId]
 * @param {string|number|null|undefined} [props.focusRequestKey] — change to re-fit the same `initialFocusJobId` (e.g. dialog open counter)
 * @param {string|number|null|undefined} [props.fitViewRequestKey] — change to re-fit/center the full graph
 * @param {(jobID: string) => void} [props.onJobDoubleClick]
 * @param {boolean} [props.showHelpText]
 * @param {import("react").ReactNode} [props.helpText]
 * @param {string} [props.emptyLabel]
 * @param {boolean} [props.hideControls]
 * @param {boolean} [props.hideLegend]
 * @param {() => void} [props.onOpenInDialog]
 * @param {string} [props.flowClassName]
 * @param {object|number} [props.minHeight]
 * @param {string|number|undefined} [props.interactionResetKey] — when this changes, clear in-graph click/hover selection
 * @param {object} [props.sx] — MUI `sx` on outer column
 */
export default function JobDependencyTreeFlow(props) {
  return (
    <ReactFlowProvider>
      <JobDependencyTreeFlowInner {...props} />
    </ReactFlowProvider>
  );
}
