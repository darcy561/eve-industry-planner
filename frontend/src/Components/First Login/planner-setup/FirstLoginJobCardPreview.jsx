import { Box, Grid, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMemo } from "react";
import { jobTypes } from "../../../Context/defaultValues";
import { JobCardFrame } from "../../Job Planner/Planner Components/Classic/ClassicJobCardFrame";
import { CompactJobCardFrame } from "../../Job Planner/Planner Components/Compact/CompactJobCardFrame";

const previewInteractionBlockSx = {
  pointerEvents: "none",
  "& .MuiButtonBase-root, & button, & a": {
    pointerEvents: "none",
  },
};

/**
 * Read-only classic + compact planner cards (same components as job planner).
 *
 * @param {boolean} props.layoutCompact - When true, compact layout is active (border on compact preview).
 */
export function FirstLoginJobCardPreview({ layoutCompact = false }) {
  const theme = useTheme();
  const previewJob = useMemo(
    () => ({
      jobID: "first-login-preview-job",
      name: "Scourge Fury Heavy Missile",
      itemID: 2679,
      jobType: jobTypes.manufacturing,
      jobStatus: 0,
      build: {
        materials: [],
      },
      totalQuantityProduced: () => 1000,
      esiJobIDs: new Set(),
      esiOrderIDs: new Set(),
      esiTransactionIDs: new Set(),
      setupCount: () => 10,
      totalCompletedMaterials: () => 0,
      isReadyToBuild: () => false,
    }),
    [],
  );

  const previewColumnMinHeight = { xs: 300, sm: 320, md: 340 };

  const selectedFrameSx = (selected) => {
    if (!selected) {
      return {
        borderRadius: 2,
        border: "2px solid transparent",
        p: 1,
      };
    }
    return {
      borderRadius: 2,
      border: `2px solid ${theme.palette.primary.main}`,
      p: 1,
      boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.2)}`,
      bgcolor: alpha(theme.palette.primary.main, 0.04),
    };
  };

  return (
    <Stack spacing={1.5}>
      <Grid container spacing={2} sx={{ alignItems: "stretch" }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={1} sx={{ height: "100%" }}>
            <Typography variant="subtitle2">Classic planner card</Typography>
            <Box
              sx={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
                minHeight: previewColumnMinHeight,
                overflowX: "auto",
                py: 1,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  maxWidth: { xs: "100%", sm: 440 },
                  mx: "auto",
                  ...selectedFrameSx(!layoutCompact),
                  ...previewInteractionBlockSx,
                }}
              >
                <JobCardFrame job={previewJob} previewStandalone />
              </Box>
            </Box>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Stack spacing={1} sx={{ height: "100%" }}>
            <Typography variant="subtitle2">Compact planner card</Typography>
            <Box
              sx={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
                minHeight: previewColumnMinHeight,
                py: 1,
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  maxWidth: 520,
                  ...selectedFrameSx(layoutCompact),
                  ...previewInteractionBlockSx,
                }}
              >
                <CompactJobCardFrame job={previewJob} />
              </Box>
            </Box>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
