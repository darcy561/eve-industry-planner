import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Grid,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  customStructureMap,
  jobTypeMapping,
  jobTypes,
  LARGE_TEXT_FORMAT,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
  Implants,
} from "../../../../Context/defaultValues";
import getSystemNameFromID from "../../../../Functions/Helper/getSystemName";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

function CurrentStructuresFrame({ selectedJobType, isLoading }) {
  const structures = useUsersStore(
    (state) =>
      state.applicationSettings.customStructures?.[
        customStructureMap[selectedJobType]
      ] ?? []
  );
  const { setDefaultCustomStructure, deleteCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  function getSystemIndex(systemID) {
    const jobTypeKey = jobTypeMapping[selectedJobType];
    return (
      useUsersStore.getState().worldData.actions.findSystemIndex(systemID)?.[
        jobTypeKey
      ] || 0
    );
  }

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
          marginTop: "20px",
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <Grid container sx={{ width: "100%" }}>
      {(structures || []).map((structure) => {
        return (
          <Grid
            key={structure.id}
            sx={{
              width: "100%",
              padding: "5px",
              display: "flex",
            }}
            size={{
              xs: 12,
              sm: 3
            }}>
            <Card
              variant="elevation"
              square
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Grid container align="center">
                  <Grid size={12}>
                    <Typography
                      color="primary"
                      sx={{ typography: LARGE_TEXT_FORMAT }}
                    >
                      {structure.name}
                    </Typography>
                  </Grid>
                  <Grid size={4}>
                    <Typography variant="caption">
                      {structureTypeMap[selectedJobType][
                        structure.structureType
                      ]?.label || "Missing Structure Type"}
                    </Typography>
                  </Grid>
                  {selectedJobType === jobTypes.reprocessing && (
                    <Grid size={8}>
                      <Typography variant="caption">
                        {[
                          rigTypeMap[selectedJobType][structure.rigSlot1]
                            ?.label,
                          rigTypeMap[selectedJobType][structure.rigSlot2]
                            ?.label,
                        ]
                          .filter((label) => label && label !== "None")
                          .join(", ") || "No Rigs"}
                      </Typography>
                    </Grid>
                  )}
                  {selectedJobType !== jobTypes.reprocessing && (
                    <Grid size={4}>
                      <Typography variant="caption">
                        {rigTypeMap[selectedJobType][structure.rigType]
                          ?.label || "Missing Rig Type"}
                      </Typography>
                    </Grid>
                  )}
                  <Grid size={4}>
                    <Typography variant="caption">{`${
                      structure.tax || 0
                    }%`}</Typography>
                  </Grid>
                  <Grid size={6}>
                    <Typography variant="caption">
                      {systemTypeMap[selectedJobType][structure.systemType]
                        ?.label || "Missing System Type"}
                    </Typography>
                  </Grid>
                  {selectedJobType !== jobTypes.reprocessing && (
                    <Grid size={6}>
                      <Box sx={{ display: "flex", flexDirection: "column" }}>
                        <Typography variant="caption">
                          {getSystemNameFromID(structure.systemID)}
                        </Typography>
                        <Tooltip
                          title="System Index Value"
                          arrow
                          placement="right"
                        >
                          <Typography variant="caption">
                            {`${getSystemIndex(structure.systemID)}%`}
                          </Typography>
                        </Tooltip>
                      </Box>
                    </Grid>
                  )}

                  {selectedJobType === jobTypes.reprocessing && (
                    <Grid size={4}>
                      <Typography variant="caption">
                        {Implants[selectedJobType][structure.implant]?.label ||
                          "Missing Implant Type"}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
              <CardActions>
                <Tooltip
                  title="Default structures are automatically applied when creating new jobs."
                  arrow
                  placement="top"
                >
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={structure.default}
                      onClick={async () => {
                        setDefaultCustomStructure(structure.id);
                        scheduleDebouncedApplicationSettingsSave();
                      }}
                    >
                      Make Default
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  onClick={async () => {
                    deleteCustomStructure(structure.id);
                    scheduleDebouncedApplicationSettingsSave();
                  }}
                >
                  Remove
                </Button>
              </CardActions>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}

export default CurrentStructuresFrame;
