import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { structureOptions } from "../../../../Context/defaultValues";
import AddIcon from "@mui/icons-material/Add";
import { useState } from "react";
import { useContext } from "react";
import { Masonry } from "@mui/lab";
import { getAnalytics, logEvent } from "firebase/analytics";
import uuid from "react-uuid";
import systemIDS from "../../../../RawData/systems.json";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { SystemIndexContext } from "../../../../Context/EveDataContext";
import { useHelperFunction } from "../../../../Hooks/GeneralHooks/useHelperFunctions";
import { ApplicationSettingsContext } from "../../../../Context/LayoutContext";
import uploadApplicationSettingsToFirebase from "../../../../Functions/Firebase/uploadApplicationSettings";
import getSystemIndexes from "../../../../Functions/System Indexes/findSystemIndex";
import VirtualisedSystemSearch from "../../../../Styled Components/autocomplete/virtualisedSystemSearch";

export function CompactManufacturingStrutures({ parentUserIndex }) {
  const { systemIndexData, updateSystemIndexData } = useContext(SystemIndexContext);
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );
  const [textValue, updateTextValue] = useState(null);
  const [systemTypeValue, updateSystemTypeValue] = useState(
    structureOptions.manSystem[0].id
  );
  const [structValue, updateStructValue] = useState(
    structureOptions.manStructure[0].id
  );
  const [rigsValue, updateRigsValue] = useState(structureOptions.manRigs[0].id);
  const [taxValue, updateTaxValue] = useState(null);
  const [systemIDValue, updateSystemIDValue] = useState(null);
  const { findParentUser, sendSnackbarNotificationSuccess } =
    useHelperFunction();
  const analytics = getAnalytics();
  const parentUser = findParentUser();
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  async function handleSubmit(event) {
    event.preventDefault();
    const newStructure = {
      id: `manStruct-${uuid()}`,
      name: textValue,
      systemType: systemTypeValue,
      structureType: structValue,
      rigType: rigsValue,
      systemID: systemIDValue,
      tax:
        structValue === structureOptions.manStructure[0].id ? 0.25 : taxValue,
      default:
        applicationSettings.manufacturingStructures.length === 0 ? true : false,
    };

    const systemIndexResults = await getSystemIndexes(systemIDValue, systemIndexData);
    const newApplicationSettings =
      applicationSettings.addCustomManufacturingStructure(newStructure);

    updateApplicationSettings(newApplicationSettings);
    uploadApplicationSettingsToFirebase(newApplicationSettings);
    updateSystemIndexData((prev) => ({ ...prev, ...systemIndexResults }));
    logEvent(analytics, "Add Manufacturing Structure", {
      UID: parentUser.accountID,
    });
    sendSnackbarNotificationSuccess(`${textValue} Added`);
  }

  return (
    <Paper elevation={3} sx={{ padding: "20px" }} square={true}>
      <Grid container>
        <Grid item xs={12} align="center" sx={{ marginBottom: "10px" }}>
          <Typography variant="h6" color="primary">
            Manufacturing Structures
          </Typography>
        </Grid>
        <Grid container item xs={12}>
          <Grid
            container
            item
            xs={12}
            lg={6}
            sx={{ paddingRight: { xs: "0px", lg: "5px" } }}
          >
            <Masonry columns={1} spacing={1}>
              <Box
                sx={{
                  padding: "20px",
                  marginBottom: { xs: "20px", lg: "0px" },
                }}
              >
                <form onSubmit={handleSubmit}>
                  <Grid container item xs={12}>
                    <Grid item xs={6} sx={{ paddingRight: "5px" }}>
                      <TextField
                        required={true}
                        size="small"
                        variant="standard"
                        sx={{
                          "& .MuiFormHelperText-root": {
                            color: (theme) => theme.palette.secondary.main,
                          },
                          "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                            {
                              display: "none",
                            },
                        }}
                        helperText="Display Name"
                        type="text"
                        onBlur={(e) => {
                          let input = e.target.value.replace(
                            /[^a-zA-Z0-9 ]/g,
                            ""
                          );
                          updateTextValue(input);
                        }}
                      />
                    </Grid>
                    <Grid item xs={6} sx={{ paddingLeft: "5px" }}>
                      <FormControl
                        sx={{
                          "& .MuiFormHelperText-root": {
                            color: (theme) => theme.palette.secondary.main,
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
                          value={systemTypeValue}
                          onChange={(e) => {
                            updateSystemTypeValue(e.target.value);
                          }}
                        >
                          {Object.values(structureOptions.manSystem).map(
                            (entry) => {
                              return (
                                <MenuItem key={entry.id} value={entry.id}>
                                  {entry.label}
                                </MenuItem>
                              );
                            }
                          )}
                        </Select>
                        <FormHelperText variant="standard">
                          System Type
                        </FormHelperText>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sx={{ paddingRight: "5px" }}>
                      <FormControl
                        sx={{
                          "& .MuiFormHelperText-root": {
                            color: (theme) => theme.palette.secondary.main,
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
                          value={structValue}
                          onChange={(e) => {
                            updateStructValue(e.target.value);
                          }}
                        >
                          {Object.values(structureOptions.manStructure).map(
                            (entry) => {
                              return (
                                <MenuItem key={entry.id} value={entry.id}>
                                  {entry.label}
                                </MenuItem>
                              );
                            }
                          )}
                        </Select>
                        <FormHelperText variant="standard">
                          Structure Type
                        </FormHelperText>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sx={{ paddingLeft: "5px" }}>
                      <FormControl
                        sx={{
                          "& .MuiFormHelperText-root": {
                            color: (theme) => theme.palette.secondary.main,
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
                          value={rigsValue}
                          onChange={(e) => {
                            updateRigsValue(e.target.value);
                          }}
                        >
                          {Object.values(structureOptions.manRigs).map(
                            (entry) => {
                              return (
                                <MenuItem key={entry.id} value={entry.id}>
                                  {entry.label}
                                </MenuItem>
                              );
                            }
                          )}
                        </Select>
                        <FormHelperText variant="standard">
                          Rig Type
                        </FormHelperText>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sx={{ paddingRight: "5px" }}>
                      <FormControl
                        sx={{
                          "& .MuiFormHelperText-root": {
                            color: (theme) => theme.palette.secondary.main,
                          },
                          "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                            {
                              display: "none",
                            },
                        }}
                        fullWidth={true}
                      >
                        <TextField
                          required={true}
                          size="small"
                          variant="standard"
                          helperText="Installation Tax %"
                          inputProps={{
                            step: "0.01",
                          }}
                          type="number"
                          onBlur={(e) => {
                            updateTaxValue(Number(e.target.value));
                          }}
                        />
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sx={{ paddingLeft: "5px" }}>
                    <VirtualisedSystemSearch
                        selectedValue={systemIDValue}
                        updateSelectedValue={(value) => {
                          updateSystemIDValue(Number(value.id));
                        }}
                      />
                    </Grid>
                    <Grid item xs={12} align="center">
                      <Tooltip title="Add new structure" arrow postion="bottom">
                        <IconButton size="small" color="primary" type="submit">
                          <AddIcon />
                        </IconButton>
                      </Tooltip>
                    </Grid>
                  </Grid>
                </form>
              </Box>
            </Masonry>
          </Grid>

          <Grid
            container
            item
            xs={12}
            lg={6}
            spacing={1}
            sx={{
              paddingLeft: "5px",
              paddingRight: "5px",
              paddingBottom: "5px",
              overflowY: "auto",
              height: { xs: "200px", lg: "380px" },
            }}
          >
            {applicationSettings.manufacturingStructures.map((entry) => {
              const systemText =
                structureOptions.manSystem[entry.systemType]?.label ||
                "Missing System Type";

              const structureText =
                structureOptions.manStructure[entry.structureType]?.label ||
                "Missing Structure Type";

              const rigText =
                structureOptions.manRigs[entry.rigType]?.label ||
                "Missing Rig Type";

              const systemName =
                systemIDS.find((i) => i.id === entry.systemID)?.name ||
                "Missing System Name";

              return (
                <Grid key={entry.id} item xs={12}>
                  <Card
                    raised={true}
                    sx={{
                      width: "100%",
                    }}
                  >
                    <CardContent>
                      <Grid container item xs={12} align="center">
                        <Grid
                          item
                          xs={12}
                          sx={{ flexWrap: "wrap", marginBottom: "10px" }}
                        >
                          <Typography
                            variant="h6"
                            sx={{ overflowWrap: "anywhere" }}
                            color="primary"
                          >
                            {entry.name}
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="body1">{systemText}</Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="body1">
                            {structureText}
                          </Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography variant="body1">{rigText}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography>{`${entry.tax || 0}%`}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography>{systemName}</Typography>
                        </Grid>
                      </Grid>
                    </CardContent>{" "}
                    <CardActions>
                      <Grid container item xs={12}>
                        <Grid item xs={6} align="center">
                          <Button
                            size="small"
                            variant="contained"
                            disabled={entry.default}
                            onClick={() => {
                              const newApplicationSettings =
                                applicationSettings.setDefaultCustomManufacturingStructure(
                                  entry.id
                                );
                              updateApplicationSettings(newApplicationSettings);
                              uploadApplicationSettingsToFirebase(newApplicationSettings);
                            }}
                          >
                            Make Default
                          </Button>
                        </Grid>
                        <Grid item xs={6} align="center">
                          <Button
                            size="small"
                            variant="text"
                            color="error"
                            onClick={() => {
                              const newApplicationSettings =
                                applicationSettings.removeCustomManufacturingStructure(
                                  entry
                                );
                              updateApplicationSettings(newApplicationSettings);
                              uploadApplicationSettingsToFirebase(newApplicationSettings);
                              logEvent(
                                analytics,
                                "Remove Manufacturing Structure",
                                {
                                  UID: parentUser.accountID,
                                }
                              );
                            }}
                          >
                            Remove
                          </Button>
                        </Grid>
                      </Grid>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Grid>
      </Grid>
    </Paper>
  );
}
