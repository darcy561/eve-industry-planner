import { useContext } from "react";
import {
  FormControl,
  FormHelperText,
  Grid,
  MenuItem,
  Select,
  TextField,
  useTheme,
} from "@mui/material";
import {
  blueprintOptions,
  customStructureMap,
  jobTypes,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../../../../Context/defaultValues";
import { useUpdateSetupValue } from "../../../../../Hooks/JobHooks/useUpdateSetupValue";
import { ApplicationSettingsContext } from "../../../../../Context/LayoutContext";
import VirtualisedSystemSearch from "../../../../../Styled Components/autocomplete/virtualisedSystemSearch";

export function WatchListSetupOptions_WatchlistDialog({
  parentUser,
  watchlistItemRequest,
  materialJobs,
  setMaterialJobs,
  itemToModify,
  updateItemToModify,
}) {
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { recalculateWatchListItems } = useUpdateSetupValue();
  const jobSetup = Object.values(materialJobs[itemToModify]?.build?.setup)[0];

  const theme = useTheme();

  return (
    <Grid container item xs={12} spacing={2}>
      <Grid container item xs={12}>
        <Grid item xs={12}>
          <FormControl
            sx={{
              "& .MuiFormHelperText-root": {
                color: theme.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
            }}
            fullWidth
          >
            <Select
              variant="standard"
              size="small"
              value={
                jobSetup.customStructureID ? jobSetup.customStructureID : ""
              }
              onChange={(e) => {
                const updatedMaterialJob = recalculateWatchListItems(
                  itemToModify,
                  watchlistItemRequest,
                  jobSetup.id,
                  "customStructureID",
                  e.target.value,
                  undefined,
                  materialJobs
                );
                setMaterialJobs(updatedMaterialJob);
              }}
            >
              {jobSetup.customStructureID ? (
                <MenuItem key="clear" value={null}>
                  None
                </MenuItem>
              ) : null}
              {applicationSettings[customStructureMap[jobSetup.jobType]].map(
                (entry) => {
                  return (
                    <MenuItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </MenuItem>
                  );
                }
              )}
            </Select>
            <FormHelperText variant="standard">
              Custom Structure Used
            </FormHelperText>
          </FormControl>
        </Grid>
      </Grid>
      {jobSetup.jobType === jobTypes.manufacturing && (
        <Grid container item xs={12}>
          <Grid item xs={6} sx={{ paddingRight: "10px" }}>
            <FormControl
              sx={{
                "& .MuiFormHelperText-root": {
                  color: theme.palette.secondary.main,
                },
                "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
              }}
              fullWidth
            >
              <Select
                variant="standard"
                size="small"
                value={jobSetup.ME}
                onChange={(e) => {
                  const updatedMaterialJob = recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    "ME",
                    e.target.value,
                    undefined,
                    materialJobs
                  );
                  setMaterialJobs(updatedMaterialJob);
                }}
              >
                {blueprintOptions.me.map((entry) => {
                  return (
                    <MenuItem key={entry.label} value={entry.value}>
                      {entry.label}
                    </MenuItem>
                  );
                })}
              </Select>
              <FormHelperText variant="standard">
                Material Efficiency
              </FormHelperText>
            </FormControl>
          </Grid>
          <Grid item xs={6} sx={{ paddingLeft: "10px" }}>
            <FormControl
              sx={{
                "& .MuiFormHelperText-root": {
                  color: theme.palette.secondary.main,
                },
                "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
              }}
              fullWidth
            >
              <Select
                variant="standard"
                size="small"
                value={jobSetup.TE}
                onChange={(e) => {
                  const updatedMaterialJob = recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    "TE",
                    e.target.value,
                    undefined,
                    materialJobs
                  );
                  setMaterialJobs(updatedMaterialJob);
                }}
              >
                {blueprintOptions.te.map((entry) => {
                  return (
                    <MenuItem key={entry.label} value={entry.value}>
                      {entry.label}
                    </MenuItem>
                  );
                })}
              </Select>
              <FormHelperText variant="standard">
                Time Efficiency
              </FormHelperText>
            </FormControl>
          </Grid>
        </Grid>
      )}
      {!jobSetup.customStructureID && (
        <Grid container item xs={12}>
          <Grid item xs={6} sx={{ paddingRight: "10px" }}>
            <FormControl
              sx={{
                "& .MuiFormHelperText-root": {
                  color: theme.palette.secondary.main,
                },
                "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
              }}
              fullWidth
            >
              <Select
                variant="standard"
                size="small"
                value={jobSetup.structureID}
                onChange={(e) => {
                  const updatedMaterialJob = recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    "structureID",
                    e.target.value,
                    structureTypeMap[jobSetup.jobType][e.target.value]
                      .requirements,
                    materialJobs
                  );
                  setMaterialJobs(updatedMaterialJob);
                }}
              >
                {Object.values(structureTypeMap[jobSetup.jobType]).map(
                  (entry) => {
                    return (
                      <MenuItem key={entry.id} value={entry.id}>
                        {entry.label}
                      </MenuItem>
                    );
                  }
                )}
              </Select>
              <FormHelperText variant="standard">Structure Type</FormHelperText>
            </FormControl>
          </Grid>
          <Grid item xs={6} sx={{ paddingLeft: "10px" }}>
            <FormControl
              sx={{
                "& .MuiFormHelperText-root": {
                  color: theme.palette.secondary.main,
                },
                "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
              }}
              fullWidth={true}
            >
              <Select
                variant="standard"
                size="small"
                value={jobSetup.rigID}
                onChange={(e) => {
                  const updatedMaterialJob = recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    "rigID",
                    e.target.value,
                    rigTypeMap[jobSetup.jobType][e.target.value].requirements,
                    materialJobs
                  );
                  setMaterialJobs(updatedMaterialJob);
                }}
              >
                {Object.values(rigTypeMap[jobSetup.jobType]).map((entry) => {
                  return (
                    <MenuItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </MenuItem>
                  );
                })}
              </Select>
              <FormHelperText variant="standard">Rig Type</FormHelperText>
            </FormControl>
          </Grid>
          <Grid container item xs={12}>
            <Grid item xs={6} sx={{ paddingRight: "10px" }}>
              <FormControl
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                    {
                      display: "none",
                    },
                }}
                fullWidth
              >
                <Select
                  variant="standard"
                  size="small"
                  value={jobSetup.systemTypeID}
                  onChange={(e) => {
                    const updatedMaterialJob = recalculateWatchListItems(
                      itemToModify,
                      watchlistItemRequest,
                      jobSetup.id,
                      "systemTypeID",
                      e.target.value,
                      systemTypeMap[jobSetup.jobType][e.target.value]
                        .requirements,
                      materialJobs
                    );
                    setMaterialJobs(updatedMaterialJob);
                  }}
                >
                  {Object.values(systemTypeMap[jobSetup.jobType]).map(
                    (entry) => {
                      return (
                        <MenuItem key={entry.id} value={entry.id}>
                          {entry.label}
                        </MenuItem>
                      );
                    }
                  )}
                </Select>
                <FormHelperText variant="standard">System Type</FormHelperText>
              </FormControl>
            </Grid>
            <Grid item xs={6} sx={{ paddingLeft: "10px" }}>
              <VirtualisedSystemSearch
                selectedValue={jobSetup.systemID}
                updateSelectedValue={(value) => {
                  const updatedMaterialJob = recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    "systemID",
                    Number(value),
                    undefined,
                    materialJobs
                  );
                  setMaterialJobs(updatedMaterialJob);
                }}
              />
            </Grid>
          </Grid>
          <Grid container item xs={12}>
            <Grid item xs={6} sx={{ paddingRight: "10px" }}>
              <TextField
                defaultValue={jobSetup.taxValue}
                size="small"
                variant="standard"
                helperText="Tax"
                type="number"
                fullWidth
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                    {
                      display: "none",
                    },
                }}
                onBlur={(e) => {
                  let inputValue =
                    Math.round(
                      (Number(e.target.value) + Number.EPSILON) * 100
                    ) / 100;
                  if (inputValue < 0) {
                    inputValue = 0;
                  }
                  const updatedMaterialJob = recalculateWatchListItems(
                    itemToModify,
                    watchlistItemRequest,
                    jobSetup.id,
                    "taxValue",
                    inputValue,
                    null,
                    materialJobs
                  );
                  setMaterialJobs(updatedMaterialJob);
                }}
              />
            </Grid>
          </Grid>
        </Grid>
      )}
    </Grid>
  );
}
