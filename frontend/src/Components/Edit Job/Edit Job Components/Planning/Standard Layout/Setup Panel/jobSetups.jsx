import { useState } from "react";
import {
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { JobSetupCard } from "./jobSetupCard";
import {
  showSnackbarSuccess,
  showSnackbarWarning,
} from "../../../../../../Events/snackbarEvents";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function JobSetupPanel(props) {
  const { state, actions } = props;
  const [anchorEl, setAnchorEl] = useState(null);
  const queryClient = useQueryClient();

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <ContentPanel
      title="Build Setup"
      paperSx={{ position: "relative", height: "auto" }}
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

      <IconButton
        id="jobSetups_menu_button"
        onClick={handleMenuClick}
        aria-controls={Boolean(anchorEl) ? "jobSetups_menu" : undefined}
        aria-haspopup="true"
        aria-expanded={Boolean(anchorEl) ? "true" : undefined}
        sx={{ position: "absolute", top: "10px", right: "10px" }}
      >
        <MoreVertIcon size="small" color="primary" />
      </IconButton>
      <Menu
        id="jobSetups_menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        slotProps={{
          list: {
            "aria-labelledby": "jobSetups_menu_button",
          },
        }}
      >
        <MenuItem
          onClick={() => {
            handleMenuClose();
            const succesfullyDeleted = state.activeJob.deleteActiveSetup();

            if (!succesfullyDeleted) {
              showSnackbarWarning(
                "Cannot delete the final setup. Create a replacement setup first.",
                3
              );
              return;
            }

            actions.updateActiveJob(state.activeJob);
            showSnackbarSuccess("Setup Deleted Successfully");
          }}
        >
          Delete Active Setup
        </MenuItem>
      </Menu>
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
