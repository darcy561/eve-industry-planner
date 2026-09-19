import { useState, useMemo } from "react";
import { Box, Button, TextField, Grid, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import {
  requirements,
  rigTypeMap,
  structureTypeMap,
  systemStructureRequirements,
  systemTypeMap,
} from "../../../../Context/defaultValues";
import VirtualisedSystemSearch from "../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import GLOBAL_CONFIG from "../../../../global-config-app";
import StructureTypeSelect from "../../../../Styled Components/Select/structureType";
import RigTypeSelect from "../../../../Styled Components/Select/rigType";
import SystemTypeSelect from "../../../../Styled Components/Select/systemType";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import Structure from "../../../../Classes/structure";
import useRigSlots from "./useRigSlots";
import { addCustomStructure as addCustomStructureFunction } from "../../../../Functions/Structure/addCustomStructure";
import { showSnackbarSuccess } from "../../../../Events/snackbarEvents";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import {
  appShellTextFieldOutlinedSx,
  getAppShellMarketSelectProps,
} from "../../../../Context/appShell";
import { FormField } from "../../../../Styled Components/Textfield/FormField";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

function StructureOptionsSelection_CustomStructures({
  selectedJobType,
  setIsLoading,
}) {
  const theme = useTheme();
  const appShellFieldProps = useMemo(
    () => getAppShellMarketSelectProps(theme),
    [theme],
  );

  const { addCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  const [currentStructure, setCurrentStructure] = useState(
    new Structure({
      name: "",
      jobType: selectedJobType,
      structureType: structureTypeMap[selectedJobType][0].id,
      rigSlot1: rigTypeMap[selectedJobType][0].id,
      rigSlot2: rigTypeMap[selectedJobType][0].id,
      systemType: systemTypeMap[selectedJobType][0].id,
      systemID: DEFAULT_SYSTEM,
      tax: 0,
    }),
  );

  const rigSlots = useRigSlots(currentStructure, (structure) =>
    setCurrentStructure(new Structure(structure)),
  );

  const rigHelperText =
    "A structure carries two rig slots. Rigs that compete for the same purpose cannot be fitted together.";

  const handleNameChange = (e) => {
    currentStructure.setName(e.target.value);
    setCurrentStructure(new Structure(currentStructure));
  };

  const handleStructureTypeChange = (selectedEntry) => {
    currentStructure.setStructureType(selectedEntry.id);
    setCurrentStructure(new Structure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID),
    );
  };

  const handleSystemTypeChange = (selectedEntry) => {
    currentStructure.setSystemType(selectedEntry.id);
    setCurrentStructure(new Structure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID),
    );
  };

  const handleTaxChange = (value) => {
    currentStructure.setTax(value);
    setCurrentStructure(new Structure(currentStructure));
  };

  const handleSystemChange = (newValue) => {
    try {
      const object = systemStructureRequirements[newValue];
      const requirements = getRequirements(object?.requirementID);
      if (
        requirements?.allowedJobTypes &&
        !requirements?.allowedJobTypes.includes(selectedJobType)
      ) {
        throw new Error("This system does not allow this kind of job.");
      }
      currentStructure.setSystemID(newValue);
      setCurrentStructure(new Structure(currentStructure));
      handleStructureStateRequirements(requirements);
    } catch (err) {
      return err;
    }
  };

  function handleStructureStateRequirements(locationRequirements) {
    if (!locationRequirements) return;

    const {
      rigID,
      systemTypeID,
      systemID: requiredSystemID,
      taxValue,
      structureID,
    } = locationRequirements;

    if (structureID !== undefined)
      currentStructure.setStructureType(structureID);
    if (rigID !== undefined) {
      currentStructure.setRigSlot1(rigID);
      currentStructure.setRigSlot2(0);
    }
    if (taxValue !== undefined) currentStructure.setTax(taxValue);
    if (requiredSystemID !== undefined)
      currentStructure.setSystemID(requiredSystemID);
    if (systemTypeID !== undefined)
      currentStructure.setSystemType(systemTypeID);

    setCurrentStructure(new Structure(currentStructure));
  }

  function getRequirements(requirementID) {
    if (
      requirementID == -1 ||
      requirementID == null ||
      requirementID == undefined
    ) {
      return {};
    }

    const matchedRequirements = requirements[requirementID];

    if (!matchedRequirements) return {};

    return matchedRequirements;
  }

  const handleAdd = async () => {
    try {
      await addCustomStructureFunction({
        structure: currentStructure,
        addCustomStructure,
        selectedJobType,
        setIsLoading,
      });
      setCurrentStructure(
        new Structure({
          name: "",
          jobType: selectedJobType,
          structureType: structureTypeMap[selectedJobType][0].id,
          rigSlot1: rigTypeMap[selectedJobType][0].id,
          rigSlot2: rigTypeMap[selectedJobType][0].id,
          systemType: systemTypeMap[selectedJobType][0].id,
          systemID: DEFAULT_SYSTEM,
          tax: 0,
        }),
      );
      scheduleDebouncedApplicationSettingsSave();
      showSnackbarSuccess(`${currentStructure.name} Added`);
    } catch (error) {
      console.error("Error adding structure:", error);
    }
  };

  const field = (title, description, node) => (
    <FormField title={title} description={description}>
      {node}
    </FormField>
  );

  return (
    <Box>
      <Grid container spacing={2} sx={{ alignItems: "flex-start" }}>
        <Grid size={12}>
          {field(
            "Display name",
            "A label you will see in structure lists to help you identify the structure. It does not need to match an in-game name.",
            <TextField
              fullWidth
              placeholder="Display Name"
              value={currentStructure.name}
              size="small"
              variant="outlined"
              label="Structure name"
              helperText="Shown in lists only; used to tell structures apart."
              sx={(t) => appShellTextFieldOutlinedSx(t)}
              onChange={handleNameChange}
              onBlur={handleNameChange}
            />,
          )}
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {field(
            "Structure Type",
            "The structure type determines the bonuses and available rigs.",
            <StructureTypeSelect
              {...appShellFieldProps}
              value={currentStructure.structureType}
              jobType={selectedJobType}
              onChange={handleStructureTypeChange}
            />,
          )}
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {field(
            "Rig slot 1",
            rigHelperText,
            <RigTypeSelect
              {...appShellFieldProps}
              value={currentStructure.rigSlot1}
              jobType={selectedJobType}
              error={rigSlots.slot1.error}
              onChange={rigSlots.slot1.onChange}
            />,
          )}
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {field(
            "Rig slot 2",
            rigHelperText,
            <RigTypeSelect
              {...appShellFieldProps}
              value={currentStructure.rigSlot2}
              jobType={selectedJobType}
              error={rigSlots.slot2.error}
              onChange={rigSlots.slot2.onChange}
            />,
          )}
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {field(
            "Security Status",
            "The security status of the system determines the effectiveness of the rigs that are fitted to the structure.",
            <SystemTypeSelect
              {...appShellFieldProps}
              value={currentStructure.systemType}
              jobType={selectedJobType}
              onChange={handleSystemTypeChange}
            />,
          )}
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {field(
            "Structure Tax",
            "Facility tax percentage for using the services at this structure. This is applied when calculating install costs for jobs.",
            <TaxPercentageTextField
              initialState={currentStructure.tax}
              onBlur={handleTaxChange}
              variant="outlined"
              label="Tax %"
              helperText="Tax Percentage"
              sx={(t) => appShellTextFieldOutlinedSx(t)}
            />,
          )}
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {field(
            "Solar System",
            "Where this structure is situated. This is used to fetch the system indexes of the system.",
            <VirtualisedSystemSearch
              selectedValue={currentStructure.systemID}
              jobType={selectedJobType}
              updateSelectedValue={handleSystemChange}
              appShellStyled
            />,
          )}
        </Grid>
        <Grid size={12}>
          <Stack direction="row" sx={{ pt: 0.5, justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={handleAdd}>
              Add structure
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

export default StructureOptionsSelection_CustomStructures;
