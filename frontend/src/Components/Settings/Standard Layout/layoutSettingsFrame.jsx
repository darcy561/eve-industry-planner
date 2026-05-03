import {
  Box,
  Divider,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { startTransition, useOptimistic } from "react";

import {
  scheduleDebouncedApplicationSettingsSave,
  scheduleDebouncedUserAccountDocumentSave,
} from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import {
  JOB_STATUS_CATALOG,
  STANDARD_TEXT_FORMAT,
} from "../../../Context/defaultValues";
import useUsersStore from "../../../Zustand/usersStore";

const textFieldSettingsSx = {
  "& .MuiFormHelperText-root": {
    color: (theme) => theme.palette.secondary.main,
  },
};

function LayoutSettingsFrame() {
  const { displayHelpCards, enableCompactLayoutView, jobStatuses } =
    useUsersStore((state) => state.applicationSettings);

  const shareCitadelNames = useUsersStore(
    (state) => state.account.shareCitadelNames,
  );

  const { toggleHideTutorials, toggleEnableCompactView, setJobStatusLabel } =
    useUsersStore((state) => state.applicationSettings.actions);

  const toggleShareCitadelNames = useUsersStore(
    (state) => state.account.actions.toggleShareCitadelNames,
  );

  const [optimisticJobStatuses, addOptimisticJobStatusName] = useOptimistic(
    jobStatuses,
    (current, { id, name }) => ({
      ...current,
      [String(id)]: { name },
    })
  );

  function handleJobStatusNameChange(id, raw) {
    const name = typeof raw === "string" ? raw : "";
    addOptimisticJobStatusName({ id, name });
    startTransition(() => {
      setJobStatusLabel(id, name);
      scheduleDebouncedApplicationSettingsSave();
    });
  }

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Grid container>
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          <FormControlLabel
            label={"Enable Help Cards"}
            labelPlacement="start"
            control={
              <Switch
                checked={displayHelpCards}
                color="primary"
                onChange={() => {
                  toggleHideTutorials();
                  scheduleDebouncedApplicationSettingsSave();
                }}
              />
            }
          />
        </Grid>
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          <FormControlLabel
            label={"Enable Compact View"}
            labelPlacement="start"
            control={
              <Switch
                checked={enableCompactLayoutView}
                color="primary"
                onChange={() => {
                  toggleEnableCompactView();
                  scheduleDebouncedApplicationSettingsSave();
                }}
              />
            }
          />
        </Grid>
        <Grid
          align="center"
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          <FormControlLabel
            label={"Share discovered citadel names"}
            labelPlacement="start"
            control={
              <Switch
                checked={shareCitadelNames}
                color="primary"
                onChange={() => {
                  toggleShareCitadelNames();
                  scheduleDebouncedUserAccountDocumentSave();
                }}
              />
            }
          />
        </Grid>
      </Grid>

      <Divider sx={{ marginY: "20px" }} />

      <Grid container>
        <Grid sx={{ paddingX: "20px" }} size={{ xs: 12 }}>
          <Typography variant="h6" color="primary">
            Job stage names
          </Typography>
        </Grid>
        <Grid sx={{ padding: "20px" }} size={{ xs: 12 }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Custom labels for planner and edit-job steps. Leave a field blank to
            use the built-in default name for that stage (shown as helper text
            below).
          </Typography>
        </Grid>

        <Grid container>
          {JOB_STATUS_CATALOG.map((entry) => (
            <Grid
              key={entry.id}
              align="center"
              sx={{ paddingX: "20px" }}
              size={{ xs: 12, sm: 6 }}
            >
              <TextField
                fullWidth
                label={`Stage ${entry.order + 1}`}
                placeholder={entry.defaultName}
                helperText={`Default: ${entry.defaultName}`}
                value={optimisticJobStatuses[String(entry.id)]?.name ?? ""}
                onChange={(e) =>
                  handleJobStatusNameChange(entry.id, e.target.value)
                }
                size="small"
                variant="standard"
                sx={textFieldSettingsSx}
              />
            </Grid>
          ))}
        </Grid>
      </Grid>
    </Box>
  );
}

export default LayoutSettingsFrame;
