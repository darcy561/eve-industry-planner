import { useContext, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  MenuItem,
  Select,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  rigTypeMap,
  structureTypeMap,
  structureTypeTooltip,
  systemStructureRequirements,
  systemTypeMap,
} from "../../../../Context/defaultValues";
import VirtualisedSystemSearch from "../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import { ApplicationSettingsContext } from "../../../../Context/LayoutContext";
import getSystemIndexes from "../../../../Functions/System Indexes/findSystemIndex";
import { SystemIndexContext } from "../../../../Context/EveDataContext";
import uploadApplicationSettingsToFirebase from "../../../../Functions/Firebase/uploadApplicationSettings";
import { logEvent } from "firebase/analytics";
import getCurrentFirebaseUser from "../../../../Functions/Firebase/currentFirebaseUser";
import { analytics } from "../../../../firebase";
import { useHelperFunction } from "../../../../Hooks/GeneralHooks/useHelperFunctions";

function StructureOptionsSelection_CustomStructures({
  selectedJobType,
  setIsLoading,
}) {
  const { applicationSettings, updateApplicationSettings } = useContext(
    ApplicationSettingsContext
  );
  const { systemIndexData, updateSystemIndexData } =
    useContext(SystemIndexContext);

  const [structureName, setStructureName] = useState("");
  const [structureType, setStructureType] = useState(
    structureTypeMap[selectedJobType][0].id
  );
  const [rigType, setRigType] = useState(
    rigTypeMap[selectedJobType][structureType]?.requirements?.rigID ||
      rigTypeMap[selectedJobType][0].id
  );
  const [taxPercentage, setTaxPercentage] = useState(
    structureTypeMap[selectedJobType][structureType]?.requirements?.taxValue ||
      0
  );
  const [systemID, setSystemID] = useState(
    structureType[selectedJobType]?.requirements?.systemID || 30000142
  );
  const [systemType, setSystemType] = useState(
    structureTypeMap[selectedJobType][structureType]?.requirements
      ?.systemTypeID || systemTypeMap[selectedJobType][0].id
  );

  const { sendSnackbarNotificationSuccess } = useHelperFunction();

  function handleStructureStateRequirements(locationRequirements) {
    if (!locationRequirements) return;

    const {
      rigID,
      systemTypeID,
      systemID: requiredSystemID,
      taxValue,
      structureID,
    } = locationRequirements;

    if (structureID !== undefined) {
      setStructureType(structureID);
    }
    if (rigID !== undefined) {
      setRigType(rigID);
    }
    if (taxValue !== undefined) {
      setTaxPercentage(taxValue.toString());
    }
    if (requiredSystemID !== undefined) {
      setSystemID(requiredSystemID);
    }
    if (systemTypeID !== undefined) {
      setSystemType(systemTypeID);
    }
  }

  const styling = {
    "& .MuiFormHelperText-root": {
      color: (theme) => theme.palette.secondary.main,
    },
    "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
      {
        display: "none",
      },
    paddingX: "20px",
  };

  async function handleAdd() {
    setIsLoading(true);
    const systemIndexResults = await getSystemIndexes(
      systemID,
      systemIndexData
    );
    const newApplicationSettings = applicationSettings.addCustomStructure(
      selectedJobType,
      structureName,
      structureType,
      rigType,
      taxPercentage,
      systemID,
      systemType
    );
    await uploadApplicationSettingsToFirebase(newApplicationSettings);
    updateApplicationSettings(newApplicationSettings);
    updateSystemIndexData((prev) => ({
      ...prev,
      ...systemIndexResults,
    }));
    logEvent(analytics, "Add Custom Structure", {
      UID: getCurrentFirebaseUser(),
      type: selectedJobType,
    });
    sendSnackbarNotificationSuccess(`${structureName} Added`);
    setStructureName("");
    setStructureType(structureTypeMap[selectedJobType][0].id);
    setRigType(
      rigTypeMap[selectedJobType][structureType]?.requirements?.rigID ||
        rigTypeMap[selectedJobType][0].id
    );
    setTaxPercentage(
      structureTypeMap[selectedJobType][structureType]?.requirements
        ?.taxValue || 0
    );
    setSystemID(
      structureType[selectedJobType]?.requirements?.systemID || 30000142
    );
    setSystemType(
      structureTypeMap[selectedJobType][structureType]?.requirements
        ?.systemTypeID || systemTypeMap[selectedJobType][0].id
    );
    setIsLoading(false);
  }

  return (
    <Box sx={{}}>
      <Grid container>
        <Grid item xs={12}>
          <FormControl fullWidth sx={styling}>
            <TextField
              placeholder="Display Name"
              value={structureName}
              size="small"
              variant="standard"
              helperText="Structure Name"
              onChange={(e) =>
                setStructureName(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ""))
              }
              onBlur={(e) =>
                setStructureName(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ""))
              }
            />
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Tooltip title={structureTypeTooltip} arrow placement="top">
            <FormControl fullWidth sx={styling}>
              <Select
                variant="standard"
                size="small"
                value={structureType}
                onChange={(event) => {
                  const newValue = event.target.value;
                  setStructureType(newValue);
                  handleStructureStateRequirements(
                    structureTypeMap[selectedJobType][newValue]?.requirements
                  );
                }}
              >
                {Object.values(structureTypeMap[selectedJobType]).map(
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
          </Tooltip>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth sx={styling}>
            <Select
              variant="standard"
              size="small"
              value={rigType}
              onChange={(event) => {
                const newValue = event.target.value;
                setRigType(newValue);
                handleStructureStateRequirements(
                  rigTypeMap[selectedJobType][newValue]?.requirements
                );
              }}
            >
              {Object.values(rigTypeMap[selectedJobType]).map((entry) => {
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
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth sx={styling}>
            <Select
              variant="standard"
              size="small"
              value={systemType}
              onChange={(event) => {
                const newValue = event.target.value;
                setSystemType(newValue);
                handleStructureStateRequirements(
                  systemTypeMap[selectedJobType][newValue]?.requirements
                );
              }}
            >
              {Object.values(systemTypeMap[selectedJobType]).map((entry) => {
                return (
                  <MenuItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </MenuItem>
                );
              })}
            </Select>
            <FormHelperText variant="standard">System Type</FormHelperText>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth sx={styling}>
            <TextField
              value={taxPercentage}
              size="small"
              variant="standard"
              helperText="Tax"
              type="number"
              onChange={(e) => setTaxPercentage(Number(e.target.value))}
              onBlur={(e) => setTaxPercentage(Number(e.target.value))}
            />
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} sx={{ paddingX: "20px" }}>
          <VirtualisedSystemSearch
            selectedValue={systemID}
            updateSelectedValue={(newValue) => {
              try {
                const requirements = systemStructureRequirements[newValue];
                if (
                  requirements?.allowedJobTypes &&
                  !requirements?.allowedJobTypes.includes(selectedJobType)
                ) {
                  throw new Error(
                    "This system does not allow this kind of job."
                  );
                }
                setSystemID(newValue);
                handleStructureStateRequirements(requirements);
              } catch (err) {
                return err;
              }
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <Button onClick={handleAdd}>Add</Button>
        </Grid>
      </Grid>
    </Box>
  );
}

export default StructureOptionsSelection_CustomStructures;
