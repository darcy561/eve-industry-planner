import { memo } from "react";
import { BaseEdge, getSmoothStepPath, Position } from "@xyflow/react";
import { useTheme } from "@mui/material";
import { getJobTypeAccentColor } from "../../Functions/Helper/jobTypeDividerColor";

function sanitizeGradId(s) {
  return `jg-${String(s).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

const JobTypeGradientEdge = memo(function JobTypeGradientEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Top,
  targetPosition = Position.Bottom,
  pathOptions,
  style,
  data,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  markerEnd,
  markerStart,
  interactionWidth,
}) {
  const theme = useTheme();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: pathOptions?.borderRadius,
    offset: pathOptions?.offset,
    stepPosition: pathOptions?.stepPosition,
    centerX: pathOptions?.centerX,
    centerY: pathOptions?.centerY,
  });

  const cFrom = getJobTypeAccentColor(theme, data?.sourceJobType);
  const cTo = getJobTypeAccentColor(theme, data?.targetJobType);
  const dimmed = Boolean(data?.edgeDimmed);
  const gradId = sanitizeGradId(id);

  const baseEdgeCommon = {
    id,
    path,
    labelX,
    labelY,
    label,
    labelStyle,
    labelShowBg,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    markerEnd,
    markerStart,
    interactionWidth,
  };

  if (dimmed) {
    return <BaseEdge {...baseEdgeCommon} style={style} />;
  }

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={cFrom} />
          <stop offset="75%" stopColor={cFrom} />
          <stop offset="100%" stopColor={cTo} />
        </linearGradient>
      </defs>
      <BaseEdge
        {...baseEdgeCommon}
        style={{ ...style, stroke: `url(#${gradId})` }}
      />
    </>
  );
});

export default JobTypeGradientEdge;
