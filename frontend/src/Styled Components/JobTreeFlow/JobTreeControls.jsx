import { Controls, ControlButton, useReactFlow } from "@xyflow/react";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RemoveIcon from "@mui/icons-material/Remove";
import ZoomOutMapIcon from "@mui/icons-material/ZoomOutMap";
import { Tooltip } from "@mui/material";

export default function JobTreeControls({ onOpenInDialog }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Controls showZoom={false} showFitView={false} showInteractive={false}>
      <ControlButton
        onClick={() => {
          zoomIn({ duration: 120 });
        }}
      >
        <Tooltip title="Zoom in" placement="right" arrow>
          <AddIcon fontSize="small" />
        </Tooltip>
      </ControlButton>
      <ControlButton
        onClick={() => {
          zoomOut({ duration: 120 });
        }}
      >
        <Tooltip title="Zoom out" placement="right" arrow>
          <RemoveIcon fontSize="small" />
        </Tooltip>
      </ControlButton>
      <ControlButton
        onClick={() => {
          fitView({ padding: 0.28, maxZoom: 1.35, duration: 180 });
        }}
      >
        <Tooltip title="Fit view" placement="right" arrow>
          <ZoomOutMapIcon fontSize="small" />
        </Tooltip>
      </ControlButton>
      {typeof onOpenInDialog === "function" ? (
        <ControlButton onClick={onOpenInDialog}>
          <Tooltip title="Open in dialog" placement="right" arrow>
            <OpenInNewIcon fontSize="small" />
          </Tooltip>
        </ControlButton>
      ) : null}
    </Controls>
  );
}
