import { useState } from "react";
import { Box, CircularProgress, IconButton, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { captureException } from "@sentry/react";

import addNewJobsToPlanner from "../../Functions/Job/building/addNewJobsToPlanner";
import { showBlueprintArchiveDialogue } from "../../Events/dialogueEvents";
import { showSnackbarError } from "../../Events/snackbarEvents";

/**
 * What a blueprint group offers: build it, or read what building it has cost before.
 *
 * @param {{bpData?: {itemID: number, name: string}}} props
 */
export default function BlueprintGroupActions({ bpData }) {
  const [building, setBuilding] = useState(false);
  const queryClient = useQueryClient();

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      {building ? (
        <CircularProgress color="primary" size={14} sx={{ marginX: 1 }} />
      ) : (
        <Tooltip title="Create Job On Planner" arrow placement="bottom">
          <Box component="span" sx={{ display: "inline-flex" }}>
            <IconButton
              color="primary"
              size="small"
              disabled={!bpData}
              aria-label={`Create job for ${bpData?.name ?? "this blueprint"}`}
              onClick={async () => {
                setBuilding(true);
                try {
                  await addNewJobsToPlanner(
                    [{ itemID: bpData.itemID }],
                    queryClient,
                  );
                } catch (error) {
                  showSnackbarError(`${bpData.name} could not be added`, 3);
                  captureException(error);
                } finally {
                  setBuilding(false);
                }
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
      )}
      <Tooltip title="Archived Job Data" arrow placement="bottom">
        <Box component="span" sx={{ display: "inline-flex" }}>
          <IconButton
            color="primary"
            size="small"
            disabled={!bpData}
            aria-label={`Archived jobs for ${bpData?.name ?? "this blueprint"}`}
            onClick={() =>
              showBlueprintArchiveDialogue(bpData.itemID, bpData.name)
            }
          >
            <AssessmentOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Tooltip>
    </Box>
  );
}
