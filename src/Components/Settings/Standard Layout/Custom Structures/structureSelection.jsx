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
  requirements,
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
import GLOBAL_CONFIG from "../../../../global-config-app";
import StructureTypeSelect from "../../../../Styled Components/Select/structureType";
import RigTypeSelect from "../../../../Styled Components/Select/rigType";
import SystemTypeSelect from "../../../../Styled Components/Select/systemType";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

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
    structureType[selectedJobType]?.requirements?.systemID || DEFAULT_SYSTEM
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
  function getRequirements(requirementID) {
    if (requirementID == null || requirementID == undefined) {
      return {};
    }

    const matchedRequirements = requirements[requirementID];

    if (!matchedRequirements) return {};

    return matchedRequirements;
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
      structureType[selectedJobType]?.requirements?.systemID || DEFAULT_SYSTEM
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
        <Grid item xs={12} sm={6} sx={{ paddingX: "20px" }}>
          <StructureTypeSelect
            value={structureType}
            onChange={(selectedEntry) => {
              setStructureType(selectedEntry.id);
              handleStructureStateRequirements(
                getRequirements(selectedEntry.requirementID)
              );
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} sx={{ paddingX: "20px" }}>
          <RigTypeSelect
            value={rigType}
            onChange={(selectedEntry) => {
              setRigType(selectedEntry.id);
              handleStructureStateRequirements(
                getRequirements(selectedEntry.requirementID)
              );
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} sx={{ paddingX: "20px" }}>
          <SystemTypeSelect
            value={systemType}
            onChange={(selectedEntry) => {
              setSystemType(selectedEntry.id);
              handleStructureStateRequirements(
                getRequirements(selectedEntry.requirementID)
              );
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6} sx={{ paddingX: "20px" }}>
          <TaxPercentageTextField
            initialState={taxPercentage}
            onBlur={(value) => {
              setTaxPercentage(value);
            }}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <VirtualisedSystemSearch
            selectedValue={systemID}
            jobType={selectedJobType}
            updateSelectedValue={(newValue) => {
              try {
                const object = systemStructureRequirements[newValue];
                const requirements = getRequirements(object?.requirementID);
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
