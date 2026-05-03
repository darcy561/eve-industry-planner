import { useState, useMemo } from "react";
import { Box, Button, TextField, Grid, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";

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
import {
  appShellTextFieldOutlinedSx,
  getAppShellMarketSelectProps,
} from "../../../../Context/appShell";
import { FirstLoginStructureFormField } from "../../../First Login/shared/FirstLoginStructureFormField";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

function StructureOptionsSelection_CustomStructures({
  selectedJobType,
  setIsLoading,
  appearance = "default",
}) {
  const theme = useTheme();
  const appShellFieldProps = useMemo(
    () =>
      appearance === "firstLogin" ? getAppShellMarketSelectProps(theme) : {},
    [appearance, theme],
  );

  const gridPadSx =
    appearance === "firstLogin" ? { px: 0 } : { paddingX: "20px" };
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
    }),
  );

  const handleNameChange = (e) => {
    currentStructure.setName(
      DOMPurify.sanitize(e.target.value, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      }),
    );
    setCurrentStructure(new CustomStructure(currentStructure));
  };

  const handleStructureTypeChange = (selectedEntry) => {
    currentStructure.setStructureType(selectedEntry.id);
    setCurrentStructure(new CustomStructure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID),
    );
  };

  const handleRigTypeChange = (selectedEntry) => {
    currentStructure.setRigType(selectedEntry.id);
    setCurrentStructure(new CustomStructure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID),
    );
  };

  const handleSystemTypeChange = (selectedEntry) => {
    currentStructure.setSystemType(selectedEntry.id);
    setCurrentStructure(new CustomStructure(currentStructure));
    handleStructureStateRequirements(
      getRequirements(selectedEntry.requirementID),
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
        new CustomStructure({
          name: "",
          jobType: selectedJobType,
          structureType: structureTypeMap[selectedJobType][0].id,
          rigType: rigTypeMap[selectedJobType][0].id,
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

  const isFirstLogin = appearance === "firstLogin";

  const wrapFirstLogin = (title, description, node) =>
    isFirstLogin ? (
      <FirstLoginStructureFormField title={title} description={description}>
        {node}
      </FirstLoginStructureFormField>
    ) : (
      node
    );

  return (
    <Box>
      <Grid
        container
        spacing={isFirstLogin ? 2 : 0}
        sx={{ alignItems: "flex-start" }}
      >
        <Grid size={12} sx={gridPadSx}>
          {wrapFirstLogin(
            "Display name",
            "A label you will see in structure lists to help you identify the structure. It does not need to match an in-game name.",
            <TextField
              fullWidth
              placeholder="Display Name"
              value={currentStructure.name}
              size="small"
              variant={isFirstLogin ? "outlined" : "standard"}
              label={isFirstLogin ? "Structure name" : undefined}
              helperText={
                isFirstLogin
                  ? "Shown in lists only; used to tell structures apart."
                  : "Structure Name"
              }
              sx={
                isFirstLogin ? (t) => appShellTextFieldOutlinedSx(t) : undefined
              }
              onChange={handleNameChange}
              onBlur={handleNameChange}
            />,
          )}
        </Grid>
        <Grid
          sx={gridPadSx}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {wrapFirstLogin(
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
          sx={gridPadSx}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {wrapFirstLogin(
            "Structure rigs",
            "Rig bonuses are the same for each tech level regardless of type of items they are applied to. The application does differenciate between the different rigs that apply to specific items. For structures that have rigs that only apply to specific item types just select the tech level for this and use an additional custom structure for items that the bonus does not apply to. ",
            <RigTypeSelect
              {...appShellFieldProps}
              value={currentStructure.rigType}
              jobType={selectedJobType}
              onChange={handleRigTypeChange}
            />,
          )}
        </Grid>
        <Grid
          sx={gridPadSx}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {wrapFirstLogin(
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
          sx={gridPadSx}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {wrapFirstLogin(
            "Structure Tax",
            "Facility tax percentage for using the services at this structure. This is applied when calculating install costs for jobs.",
            <TaxPercentageTextField
              initialState={currentStructure.tax}
              onBlur={handleTaxChange}
              variant={isFirstLogin ? "outlined" : "standard"}
              label={isFirstLogin ? "Tax %" : undefined}
              helperText={"Tax Percentage"}
              sx={
                isFirstLogin ? (t) => appShellTextFieldOutlinedSx(t) : undefined
              }
            />,
          )}
        </Grid>
        <Grid
          sx={gridPadSx}
          size={{
            xs: 12,
            sm: 6,
          }}
        >
          {wrapFirstLogin(
            "Solar System",
            "Where this structure is situated. This is used to fetch the system indexes of the system.",
            <VirtualisedSystemSearch
              selectedValue={currentStructure.systemID}
              jobType={selectedJobType}
              updateSelectedValue={handleSystemChange}
              appShellStyled={isFirstLogin}
            />,
          )}
        </Grid>
        <Grid size={12} sx={gridPadSx}>
          <Stack
            direction="row"
            sx={{
              pt: isFirstLogin ? 0.5 : 0,
              justifyContent: isFirstLogin ? "flex-end" : "flex-start",
            }}
          >
            <Button
              variant={isFirstLogin ? "contained" : "text"}
              onClick={handleAdd}
            >
              Add structure
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

export default StructureOptionsSelection_CustomStructures;
