import { useState } from "react";
import { Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import JobTypeSelection_CustomStructures from "../../Settings/Standard Layout/Custom Structures/jobTypeSelection";
import StructureOptionsSelection_CustomStructures from "../../Settings/Standard Layout/Custom Structures/structureSelection";
import InventionStructureSelection from "../../Settings/Standard Layout/Custom Structures/inventionStructureSelection";
import ReprocessingStructureSelection from "../../Settings/Standard Layout/Custom Structures/reprocessingStructureSelection";
import CurrentStructuresFrame from "../../Settings/Standard Layout/Custom Structures/currentStructures";
import { jobTypes } from "../../../Context/defaultValues";

const innerSurfaceSx = {
  p: { xs: 2, sm: 2.5 },
  borderRadius: 2,
  border: "1px solid",
  borderColor: (theme) => alpha(theme.palette.primary.main, 0.14),
  bgcolor: (theme) =>
    alpha(
      theme.palette.background.paper,
      theme.palette.mode === "dark" ? 0.5 : 0.88,
    ),
};

/**
 * First-login onboarding layout for custom structures (same behaviour as
 * settings, without the old full-page settings shell).
 */
export default function FirstLoginCustomStructures() {
  const [selectedJobType, setSelectedJobType] = useState(null);
  const [initialSelectionMade, setInitialSelectionMade] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Stack spacing={2.5}>
      <Paper variant="outlined" sx={innerSurfaceSx}>
        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
          Choose a job type
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          The application currently supports saving custom structures that
          perform the following jobs:
        </Typography>
        <JobTypeSelection_CustomStructures
          selectedJobType={selectedJobType}
          setSelectedJobType={setSelectedJobType}
          setInitialSelectionMade={setInitialSelectionMade}
        />
      </Paper>

      {initialSelectionMade && (
        <>
          <Paper variant="outlined" sx={innerSurfaceSx}>
            <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
              Configure your custom structure
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              You can add multiple custom structures for each job type but only
              one structure can be the default. The default structure is what is
              used initially when creating new jobs of this job type, it can be
              quickly changed in the job later if needed.
            </Typography>
            {selectedJobType === jobTypes.reprocessing ? (
              <ReprocessingStructureSelection
                key={selectedJobType}
                selectedJobType={selectedJobType}
                setIsLoading={setIsLoading}
                appearance="firstLogin"
              />
            ) : selectedJobType === jobTypes.invention ? (
              <InventionStructureSelection
                key={selectedJobType}
                selectedJobType={selectedJobType}
                setIsLoading={setIsLoading}
                appearance="firstLogin"
              />
            ) : (
              <StructureOptionsSelection_CustomStructures
                key={selectedJobType}
                selectedJobType={selectedJobType}
                setIsLoading={setIsLoading}
                appearance="firstLogin"
              />
            )}
          </Paper>

          <Paper variant="outlined" sx={{ ...innerSurfaceSx, p: 1.5 }}>
            <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
              Your structures for this lane
            </Typography>
            <CurrentStructuresFrame
              selectedJobType={selectedJobType}
              isLoading={isLoading}
              appearance="firstLogin"
            />
          </Paper>
        </>
      )}
    </Stack>
  );
}
