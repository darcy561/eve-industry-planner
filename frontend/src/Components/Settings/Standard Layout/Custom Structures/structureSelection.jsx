import { useState } from "react";
import { Box, Button, FormControl, TextField, Grid } from "@mui/material";

import DOMPurify from "dompurify";
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
import CustomStructure from "../../../../Classes/customStructure";
import { addCustomStructure as addCustomStructureFunction } from "../../../../Functions/Structure/addCustomStructure";
import { showSnackbarSuccess } from "../../../../Events/snackbarEvents";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

function StructureOptionsSelection_CustomStructures({
  selectedJobType,
  setIsLoading,
}) {
  const { addCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  const [currentStructure, setCurrentStructure] = useState(
    new CustomStructure({
      name: "",
      jobType: selectedJobType,
      structureType: structureTypeMap[selectedJobType][0].id,
      rigType: rigTypeMap[selectedJobType][0].id,
      systemType: systemTypeMap[selectedJobType][0].id,
      systemID: DEFAULT_SYSTEM,
      tax: 0,
    })
  );

  const handleNameChange = (e) => {
    currentStructure.setName(DOMPurify.sanitize(e.target.value, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }));
    setCurrentStructure(new CustomStructure(currentStructure));
  };

  const handleStructureTypeChange = (selectedEntry) => {
    currentStructure.setStructureType(selectedEntry.id);
    setCurrentStructure(new CustomStructure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID)
    );
  };

  const handleRigTypeChange = (selectedEntry) => {
    currentStructure.setRigType(selectedEntry.id);
    setCurrentStructure(new CustomStructure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID)
    );
  };

  const handleSystemTypeChange = (selectedEntry) => {
    currentStructure.setSystemType(selectedEntry.id);
    setCurrentStructure(new CustomStructure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID)
    );
  };

  const handleTaxChange = (value) => {
    currentStructure.setTax(value);
    setCurrentStructure(new CustomStructure(currentStructure));
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
      setCurrentStructure(new CustomStructure(currentStructure));
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
    if (rigID !== undefined) currentStructure.setRigType(rigID);
    if (taxValue !== undefined) currentStructure.setTax(taxValue);
    if (requiredSystemID !== undefined)
      currentStructure.setSystemID(requiredSystemID);
    if (systemTypeID !== undefined)
      currentStructure.setSystemType(systemTypeID);

    setCurrentStructure(new CustomStructure(currentStructure));
  }

  function getRequirements(requirementID) {
    if (requirementID == -1 || requirementID == null || requirementID == undefined) {
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

  const handleAdd = async () => {
    try {
      await addCustomStructureFunction({
        structure: currentStructure,
        addCustomStructure,
        selectedJobType,
        setIsLoading,
      });
      setCurrentStructure(
        new CustomStructure({
          name: "",
          jobType: selectedJobType,
          structureType: structureTypeMap[selectedJobType][0].id,
          rigType: rigTypeMap[selectedJobType][0].id,
          systemType: systemTypeMap[selectedJobType][0].id,
          systemID: DEFAULT_SYSTEM,
          tax: 0,
        })
      );
      scheduleDebouncedApplicationSettingsSave();
      showSnackbarSuccess(`${currentStructure.name} Added`);
    } catch (error) {
      console.error("Error adding structure:", error);
    }
  };

  return (
    <Box>
      <Grid container>
        <Grid size={12}>
          <FormControl fullWidth sx={styling}>
            <TextField
              placeholder="Display Name"
              value={currentStructure.name}
              size="small"
              variant="standard"
              helperText="Structure Name"
              onChange={handleNameChange}
              onBlur={handleNameChange}
            />
          </FormControl>
        </Grid>
        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <StructureTypeSelect
            value={currentStructure.structureType}
            jobType={selectedJobType}
            onChange={handleStructureTypeChange}
          />
        </Grid>
        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <RigTypeSelect
            value={currentStructure.rigType}
            jobType={selectedJobType}
            onChange={handleRigTypeChange}
          />
        </Grid>
        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <SystemTypeSelect
            value={currentStructure.systemType}
            jobType={selectedJobType}
            onChange={handleSystemTypeChange}
          />
        </Grid>
        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <TaxPercentageTextField
            initialState={currentStructure.tax}
            jobType={selectedJobType}
            onBlur={handleTaxChange}
          />
        </Grid>
        <Grid
          size={{
            xs: 12,
            sm: 6
          }}>
          <VirtualisedSystemSearch
            selectedValue={currentStructure.systemID}
            jobType={selectedJobType}
            updateSelectedValue={handleSystemChange}
          />
        </Grid>
        <Grid size={12}>
          <Button onClick={handleAdd}>Add</Button>
        </Grid>
      </Grid>
    </Box>
  );
}

export default StructureOptionsSelection_CustomStructures;
