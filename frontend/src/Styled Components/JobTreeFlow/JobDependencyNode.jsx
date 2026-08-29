import { memo, useContext } from "react";
import { Avatar, Box, Chip, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import BuildIcon from "@mui/icons-material/Build";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Handle, Position } from "@xyflow/react";
import { getJobTypeAccentColour } from "../../Functions/Helper/jobTypeDividerColour";
import { JobTreeInteractionContext } from "./jobTreeInteractionContext";

const HANDLE_TO_PARENT = "to-parent";
const HANDLE_FROM_CHILDREN = "from-children";

function getJobTreeNodeSelectionColor(theme, data) {
  if (data.isComplete) return theme.palette.success.main;
  if (data.readyToBuild) return theme.palette.warning.main;
  const esi = Number(data.esiCount) || 0;
  if (esi > 0) return theme.palette.info.main;
  return getJobTypeAccentColour(theme, data.jobType);
}

function JobDependencyNodeImpl({ id, data }) {
  const theme = useTheme();
  const { onSelectNode, onOpenNode } = useContext(JobTreeInteractionContext);
  const focused = Boolean(data.focused);
  const accent = getJobTypeAccentColour(theme, data.jobType);
  const complete = Boolean(data.isComplete);
  const esiCount = Number(data.esiCount) || 0;
  const showEsiBuild = !complete && esiCount > 0;
  const showReadyToBuild = !complete && Boolean(data.readyToBuild);
  const selectionColor = getJobTreeNodeSelectionColor(theme, data);
  const itemID =
    data.itemID != null && data.itemID !== "" ? String(data.itemID) : null;

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        borderRadius: 1.5,
        border: focused ? 0 : 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: focused ? 0 : 1,
        overflow: "hidden",
        cursor: "pointer",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelectNode(id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onOpenNode(id);
      }}
    >
      {focused && (
        <>
          <Box
            className="job-dependency-node__edge-sweep"
            aria-hidden
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              height: 2,
              zIndex: 7,
              width: "100%",
              overflow: "hidden",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              pointerEvents: "none",
            }}
          >
            <Box
              className="job-dependency-node__edge-sweep-bar"
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "44%",
                height: "100%",
                background: (t) =>
                  `linear-gradient(90deg, transparent, ${alpha(
                    selectionColor,
                    0.95
                  )}, ${alpha(
                    t.palette.common.white,
                    t.palette.mode === "dark" ? 0.4 : 0.65
                  )}, ${alpha(selectionColor, 0.9)}, transparent)`,
                filter: (t) =>
                  t.palette.mode === "dark"
                    ? "brightness(1.1)"
                    : "brightness(1.05)",
                animation:
                  "jobDependencyNodeEdgeShimmer 2.2s ease-in-out infinite",
                "@media (prefers-reduced-motion: reduce)": { animation: "none" },
              }}
            />
          </Box>
          <Box
            className="job-dependency-node__pulse-ring"
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              zIndex: 6,
              borderRadius: 1.5,
              border: 2,
              borderColor: selectionColor,
              pointerEvents: "none",
              background: "transparent",
            }}
          />
        </>
      )}

      <Handle id={HANDLE_TO_PARENT} type="source" position={Position.Top} />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          minHeight: 72,
        }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            px: 1,
            py: 0.75,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          {itemID ? (
            <Avatar
              src={`https://images.evetech.net/types/${itemID}/icon?size=64`}
              alt={data.label ?? ""}
              variant="square"
              slotProps={{ img: { loading: "lazy", decoding: "async" } }}
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                border: 1,
                borderColor: "divider",
                bgcolor: "action.hover",
              }}
            />
          ) : (
            <Box
              aria-hidden
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                border: 1,
                borderColor: "divider",
                bgcolor: "action.hover",
              }}
            />
          )}
          <Typography
            variant="body2"
            fontWeight={600}
            color="text.primary"
            title={data.label}
            sx={{
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.label}
          </Typography>
        </Box>
        <Box
          aria-hidden
          sx={{
            height: 5,
            flexShrink: 0,
            width: "100%",
            bgcolor: accent,
          }}
        />
      </Box>

      {showReadyToBuild && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: 1.5,
            zIndex: 1,
            bgcolor: alpha(theme.palette.warning.main, 0.14),
          }}
        />
      )}

      {showEsiBuild && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: 1.5,
            zIndex: 1,
            background: (t) =>
              `linear-gradient(180deg, transparent 40%, ${
                t.palette.mode === "dark"
                  ? "rgba(2, 119, 189, 0.36)"
                  : "rgba(2, 136, 209, 0.26)"
              } 100%)`,
          }}
        />
      )}

      {(showReadyToBuild || showEsiBuild) && (
        <Box
          sx={{
            position: "absolute",
            right: 6,
            bottom: 10,
            zIndex: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 0.5,
            pointerEvents: "none",
            maxWidth: "calc(100% - 52px)",
          }}
        >
          {showReadyToBuild && (
            <Chip
              icon={<PlayArrowIcon sx={{ fontSize: "16px !important" }} />}
              label="Ready"
              title="All materials bought — link ESI industry jobs to continue (none linked yet)"
              size="small"
              sx={{
                fontWeight: 700,
                bgcolor: "warning.main",
                color: "warning.contrastText",
                "& .MuiChip-icon": { color: "inherit" },
              }}
            />
          )}
          {showEsiBuild && (
            <Chip
              icon={<BuildIcon sx={{ fontSize: "16px !important" }} />}
              label={`ESI ${esiCount}`}
              size="small"
              sx={{
                fontWeight: 700,
                bgcolor: "info.main",
                color: "info.contrastText",
                "& .MuiChip-icon": { color: "inherit" },
              }}
            />
          )}
        </Box>
      )}

      {complete && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: 1.5,
            zIndex: 4,
            bgcolor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(46, 125, 50, 0.22)"
                : "rgba(46, 125, 50, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircleIcon
            sx={{
              fontSize: 44,
              color: "success.main",
              opacity: 0.92,
              filter: (t) =>
                t.palette.mode === "dark"
                  ? "drop-shadow(0 0 6px rgba(0,0,0,0.6))"
                  : "none",
            }}
          />
        </Box>
      )}

      <Handle id={HANDLE_FROM_CHILDREN} type="target" position={Position.Bottom} />
    </Box>
  );
}

export const JobDependencyNode = memo(JobDependencyNodeImpl);
