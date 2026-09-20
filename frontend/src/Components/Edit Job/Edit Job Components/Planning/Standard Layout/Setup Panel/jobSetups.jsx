import { Grid, IconButton, Tooltip } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import AddIcon from "@mui/icons-material/Add";
import { JobSetupCard } from "./jobSetupCard";
import {
  showSnackbarSuccess,
  showSnackbarWarning,
} from "../../../../../../Events/snackbarEvents";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import {
  attachNewSetupToJob,
  deleteActiveSetup,
} from "../../../../Edit Job Hooks/jobCommands";
import { setupToBuildFrom } from "../../../../Edit Job Hooks/jobSelectors";
import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
} from "../../../../../../Functions/JobPlanner/setupBuildHelpers";

export function JobSetupPanel(props) {
  const { state, actions } = props;
  const queryClient = useQueryClient();

  return (
    <ContentPanel
      title="Build Setup"
      paperSx={{ position: "relative", height: "auto" }}
      enableMenu
      menuItems={[
        {
          label: "Delete Active Setup",
          onClick: () => {
            if (Object.keys(state.activeJob.build.setup).length <= 1) {
              showSnackbarWarning(
                "Cannot delete the final setup. Create a replacement setup first.",
                3,
              );
              return;
            }

            actions.run(deleteActiveSetup());
            showSnackbarSuccess("Setup Deleted Successfully");
          },
        },
      ]}
    >
      <Tooltip title="Add Setup" arrow placement="top">
        <IconButton
          sx={{ position: "absolute", top: "10px", left: "10px" }}
          color="primary"
          onClick={() => {
            const job = state.activeJob;
            actions.run(
              attachNewSetupToJob(
                buildSetupFromQuantity(
                  job,
                  { runCount: 1, jobCount: 1 },
                  queryClient,
                  buildSetupContextForJob(job, queryClient),
                  { basedOn: setupToBuildFrom(job) },
                ),
              ),
            );
            showSnackbarSuccess("Added");
          }}
        >
          <AddIcon />
        </IconButton>
      </Tooltip>

      <Grid container spacing={2} size={12}>
        {Object.values(state.activeJob.build.setup).map((setupEntry) => {
          return (
            <JobSetupCard
              {...props}
              key={setupEntry.id}
              setupEntry={setupEntry}
            />
          );
        })}
      </Grid>
    </ContentPanel>
  );
}
