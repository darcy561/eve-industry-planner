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
import { useContext } from "react";
import { ApplicationSettingsContext } from "../../../../Context/LayoutContext";
import {
  customStructureMap,
  jobTypeMapping,
  LARGE_TEXT_FORMAT,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../../../Context/defaultValues";
import { SystemIndexContext } from "../../../../Context/EveDataContext";
import getSystemNameFromID from "../../../../Functions/Helper/getSystemName";
import uploadApplicationSettingsToFirebase from "../../../../Functions/Firebase/uploadApplicationSettings";

function CurrentStructuresFrame({ selectedJobType, isLoading }) {
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );
  const { systemIndexData } = useContext(SystemIndexContext);

  function getSystemIndex(systemID) {
    const jobTypeKey = jobTypeMapping[selectedJobType];
    return systemIndexData[systemID]?.[jobTypeKey] || 0;
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
      {applicationSettings[customStructureMap[selectedJobType]].map(
        (structure) => {
          return (
            <Grid
              key={structure.id}
              item
              xs={12}
              sm={3}
              sx={{
                width: "100%",
                padding: "5px",
                display: "flex",
              }}
            >
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
                    <Grid item xs={12}>
                      <Typography
                        color="primary"
                        sx={{ typography: LARGE_TEXT_FORMAT }}
                      >
                        {structure.name}
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption">
                        {structureTypeMap[selectedJobType][
                          structure.structureType
                        ]?.label || "Missing Structure Type"}
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption">
                        {rigTypeMap[selectedJobType][structure.rigType]
                          ?.label || "Missing Rig Type"}
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography variant="caption">{`${
                        structure.tax || 0
                      }%`}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption">
                        {systemTypeMap[selectedJobType][structure.systemType]
                          ?.label || "Missing System Type"}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
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
                        onClick={() => {
                          const newApplicationSettings =
                            applicationSettings.setDefaultCustomStructure(
                              structure.id
                            );
                          updateApplicationSettings(newApplicationSettings);
                          uploadApplicationSettingsToFirebase(
                            newApplicationSettings
                          );
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
                    onClick={() => {
                      const newApplicationSettings =
                        applicationSettings.deleteCustomStructure(structure.id);
                      updateApplicationSettings(newApplicationSettings);
                      uploadApplicationSettingsToFirebase(
                        newApplicationSettings
                      );
                    }}
                  >
                    Remove
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          );
        }
      )}
    </Grid>
  );
}

export default CurrentStructuresFrame;
