import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Grid,
  Typography,
} from "@mui/material";
import { useContext } from "react";
import { ApplicationSettingsContext } from "../../../../Context/LayoutContext";
import {
  customStructureMap,
  jobTypeMapping,
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../../../Context/defaultValues";
import { SystemIndexContext } from "../../../../Context/EveDataContext";
import getSystemNameFromID from "../../../../Functions/Helper/getSystemName";

function CurrentStructuresFrame({ selectedJobType }) {
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );
  const { systemIndexData } = useContext(SystemIndexContext);

  const structureStorageLocation =
    applicationSettings[customStructureMap[selectedJobType]];
  return (
    <Box>
      <Grid container>
        {structureStorageLocation.map((structure) => {
          return (
            <Grid key={structure.id} item xs={6} sm={3}>
              <Card>
                <CardContent>
                  <Grid container>
                    <Grid item xs={12}>
                      <Typography>{structure.name}</Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography>
                        {structureTypeMap[selectedJobType][
                          structure.structureType
                        ]?.label || "Missing Structure Type"}
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography>
                        {rigTypeMap[selectedJobType][structure.rigType]
                          ?.label || "Missing Rig Type"}
                      </Typography>
                    </Grid>
                    <Grid item xs={4}>
                      <Typography>{`${structure.tax || 0}%`}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography>
                        {systemTypeMap[selectedJobType][structure.systemType]
                          ?.label || "Missing System Type"}
                      </Typography>
                    </Grid>
                    <Grid xs={6}>
                      <Typography>
                        {getSystemNameFromID(structure.systemID)}
                      </Typography>
                      <Typography variant="caption">
                        {`${
                          systemIndexData[structure.systemID][
                            jobTypeMapping[selectedJobType]
                          ] || 0
                        }%`}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant="outlined"
                              disabled={structure.default}
                              onClick={() => {
                                  
                              }}
                  >
                    Make Default
                  </Button>
                  <Button size="small" variant="text" color="error">
                    Remove
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

export default CurrentStructuresFrame;
