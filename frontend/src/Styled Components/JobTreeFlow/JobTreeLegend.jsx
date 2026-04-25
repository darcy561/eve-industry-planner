import { Box, Chip, Typography } from "@mui/material";
import BuildIcon from "@mui/icons-material/Build";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

export default function JobTreeLegend() {
  return (
    <Box
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 8,
        transform: "translateX(-50%)",
        zIndex: 8,
        px: 1.25,
        py: 0.75,
        bgcolor: "background.paper",
        borderRadius: 0.75,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        flexWrap: "nowrap",
        whiteSpace: "nowrap",
      }}
    >
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
        <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
        <Typography variant="caption" color="text.secondary">
          Job is complete and costs have been passed to parent jobs.
        </Typography>
      </Box>

      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
        <Chip
          size="small"
          icon={<BuildIcon sx={{ fontSize: "16px !important" }} />}
          label="ESI n"
          sx={{
            fontWeight: 700,
            bgcolor: "info.main",
            color: "info.contrastText",
            "& .MuiChip-icon": { color: "inherit" },
          }}
        />
        <Typography variant="caption" color="text.secondary">
          Job is currently being built, incdicates how many ESI jobs are linked.
        </Typography>
      </Box>

      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, whiteSpace: "nowrap" }}>
        <Chip
          size="small"
          icon={<PlayArrowIcon sx={{ fontSize: "16px !important" }} />}
          label="Ready"
          sx={{
            fontWeight: 700,
            bgcolor: "warning.main",
            color: "warning.contrastText",
            "& .MuiChip-icon": { color: "inherit" },
          }}
        />
        <Typography variant="caption" color="text.secondary">
          Materials purchased and ready to build.
        </Typography>
      </Box>
    </Box>
  );
}
