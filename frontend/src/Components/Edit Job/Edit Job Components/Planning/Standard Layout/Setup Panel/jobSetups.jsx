import {
  Grid,
  IconButton,
  Tooltip,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import AddIcon from "@mui/icons-material/Add";
import { JobSetupCard } from "./jobSetupCard";
import {
  showSnackbarSuccess,
  showSnackbarWarning,
} from "../../../../../../Events/snackbarEvents";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

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
            const successfullyDeleted = state.activeJob.deleteActiveSetup();

            if (!successfullyDeleted) {
              showSnackbarWarning(
                "Cannot delete the final setup. Create a replacement setup first.",
                3
              );
              return;
            }

            actions.updateActiveJob(state.activeJob);
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
            state.activeJob.addNewSetup(queryClient);
            actions.updateActiveJob(state.activeJob);
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
