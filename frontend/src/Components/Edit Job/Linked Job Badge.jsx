import { useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  Grid,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ClearIcon from "@mui/icons-material/Clear";
import { ParentJobDialog } from "./parentJobDialog";
import useUsersStore from "../../Zustand/usersStore";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { showSnackbarError } from "../../Events/snackbarEvents";
import { requestEditJobNavigation } from "../../Events/editJobNavigationEvents";

export function LinkedJobBadge(props) {
  const { state, actions } = props;
  const { findJobInJobArray } = useUsersStore.getState().jobData.actions;
  const [dialogTrigger, updateDialogTrigger] = useState(false);
  const navigate = useNavigate({ from: '/editjob/$jobID' });
  const search = useSearch({ from: '/editjob/$jobID' });

  const parentJobSelection = actions.getCurrentParentJobs();

  return (
    <>
      <ParentJobDialog
        {...props}
        dialogTrigger={dialogTrigger}
        updateDialogTrigger={updateDialogTrigger}
      />
      <Stack
        direction="row"
        sx={{ marginBottom: { xs: "10px", sm: "0px" }, position: "relative" }}
      >
        <Box sx={{ width: "100%" }}>
          <Grid container>
            <Grid align="center" sx={{ marginBottom: { xs: "10px", sm: "0px" } }} size={12}>
              <Typography variant="h6" color="primary">
                Parent Jobs
              </Typography>
            </Grid>
            <IconButton
              size="small"
              color="primary"
              sx={{ position: "absolute", top: "0px", right: "40px" }}
              onClick={() => {
                updateDialogTrigger(true);
              }}
            >
              <AddIcon />
            </IconButton>

            <Box
              sx={{
                width: "100%",
                maxHeight: { xs: "200px", sm: "250px", md: "300px" },
                overflowY: "auto",
                overflowX: "hidden",
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                padding: "5px",
              }}
            >
              {parentJobSelection.map((jobID) => {
                let parent = findJobInJobArray(jobID);
                if (!parent) return null;
                return (
                  <Chip
                    key={parent.jobID}
                    label={parent.name}
                    size="large"
                    deleteIcon={<ClearIcon />}
                    avatar={
                      <Avatar
                        src={`https://image.eveonline.com/Type/${parent.itemID}_32.png`}
                      />
                    }
                    clickable
                    onClick={async () => {
                      const navSearch = {};
                      if (
                        search.activeGroup != null &&
                        String(search.activeGroup) !== ""
                      ) {
                        navSearch.activeGroup = search.activeGroup;
                      }
                      if (
                        search.pageView != null &&
                        String(search.pageView) !== ""
                      ) {
                        navSearch.pageView = search.pageView;
                      }
                      const outcome = await requestEditJobNavigation({
                        jobID: parent.jobID,
                        search: navSearch,
                      });
                      if (outcome === "not-handled") {
                        navigate({
                          to: "/editjob/$jobID",
                          params: { jobID: parent.jobID },
                          search: navSearch,
                        });
                      }
                    }}
                    variant="outlined"
                    sx={{
                      "& .MuiChip-deleteIcon": {
                        color: "error.main",
                      },
                      boxShadow: 3,
                      flexShrink: 0,
                    }}
                    onDelete={() => {
                      actions.markParentJobForRemoval(jobID);
                      showSnackbarError(`${parent.name} Unlinked`);
                    }}
                  />
                );
              })}
            </Box>
          </Grid>
        </Box>
      </Stack>
    </>
  );
}
