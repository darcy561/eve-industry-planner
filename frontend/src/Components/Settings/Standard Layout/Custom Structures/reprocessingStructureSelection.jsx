import { useState, useMemo } from "react";
import { Box, TextField, Button, Grid, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import StructureTypeSelect from "../../../../Styled Components/Select/structureType";
import SystemTypeSelect from "../../../../Styled Components/Select/systemType";
import RigTypeSelect from "../../../../Styled Components/Select/rigType";
import ImplantSelect from "../../../../Styled Components/Select/implantSelector";
import { jobTypes } from "../../../../Context/defaultValues";
import ReprocessingStructure from "../../../../Classes/reprocessingStructure";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import { addCustomStructure as addCustomStructureFunction } from "../../../../Functions/Structure/addCustomStructure";
import useUsersStore from "../../../../Zustand/usersStore";
import DOMPurify from "dompurify";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import {
  appShellTextFieldOutlinedSx,
  getAppShellMarketSelectProps,
} from "../../../../Context/appShell";
import { FirstLoginStructureFormField } from "../../../First Login/shared/FirstLoginStructureFormField";

function ReprocessingStructureSelection({
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
  const isFirstLogin = appearance === "firstLogin";

  const wrapFirstLogin = (title, description, node) =>
    isFirstLogin ? (
      <FirstLoginStructureFormField title={title} description={description}>
        {node}
      </FirstLoginStructureFormField>
    ) : (
      node
    );
  const { addCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  const [chosenStructure, setChosenStructure] = useState(
    new ReprocessingStructure(),
  );
  const [rigSlot1Error, setRigSlot1Error] = useState(false);
  const [rigSlot2Error, setRigSlot2Error] = useState(false);
  const errorText = "Cannot have the same rig or related rigs in both slots";

  const handleAdd = async () => {
    try {
      await addCustomStructureFunction({
        structure: chosenStructure,
        addCustomStructure,
        selectedJobType,
        setIsLoading,
      });
      setChosenStructure(new ReprocessingStructure());
      scheduleDebouncedApplicationSettingsSave();
    } catch (error) {
      console.error("Error adding reprocessing structure:" + error);
    }
  };

  const handleNameChange = (e) => {
    chosenStructure.setName(
      DOMPurify.sanitize(e.target.value, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      }),
    );
    setChosenStructure(new ReprocessingStructure(chosenStructure));
  };

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
              value={chosenStructure.name}
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
              value={chosenStructure.structureType}
              jobType={jobTypes.reprocessing}
              onChange={(selectedEntry) => {
                chosenStructure.setStructureType(selectedEntry.id);
                setChosenStructure(new ReprocessingStructure(chosenStructure));
              }}
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
              value={chosenStructure.systemType}
              jobType={jobTypes.reprocessing}
              onChange={(selectedEntry) => {
                chosenStructure.setSystemType(selectedEntry.id);
                setChosenStructure(new ReprocessingStructure(chosenStructure));
              }}
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
            "Rig slot 1",
            "Reprocessing rigs modify the yield of different material types. Multiple rigs that effect the same material type cannot be used on the same structure.",
            <RigTypeSelect
              {...appShellFieldProps}
              value={chosenStructure.rigSlot1}
              jobType={jobTypes.reprocessing}
              error={{ isError: rigSlot1Error, errorText }}
              onChange={(selectedEntry) => {
                if (selectedEntry.id === 0) {
                  chosenStructure.setRigSlot1(0);
                  setRigSlot1Error(false);
                  setRigSlot2Error(false);
                } else if (
                  chosenStructure.rigSlot2 === selectedEntry.id ||
                  selectedEntry.relatedTo.includes(chosenStructure.rigSlot2)
                ) {
                  chosenStructure.setRigSlot1(0);
                  setRigSlot1Error(true);
                } else {
                  chosenStructure.setRigSlot1(selectedEntry.id);
                  setRigSlot1Error(false);
                  setRigSlot2Error(false);
                }
                setChosenStructure(new ReprocessingStructure(chosenStructure));
              }}
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
            "Rig slot 2",
            "Reprocessing rigs modify the yield of different material types. Multiple rigs that effect the same material type cannot be used on the same structure.",
            <RigTypeSelect
              {...appShellFieldProps}
              value={chosenStructure.rigSlot2}
              jobType={jobTypes.reprocessing}
              error={{ isError: rigSlot2Error, errorText }}
              onChange={(selectedEntry) => {
                if (selectedEntry.id === 0) {
                  chosenStructure.setRigSlot2(0);
                  setRigSlot1Error(false);
                  setRigSlot2Error(false);
                } else if (
                  chosenStructure.rigSlot1 === selectedEntry.id ||
                  selectedEntry.relatedTo.includes(chosenStructure.rigSlot1)
                ) {
                  chosenStructure.setRigSlot2(0);
                  setRigSlot2Error(true);
                } else {
                  chosenStructure.setRigSlot2(selectedEntry.id);
                  setRigSlot1Error(false);
                  setRigSlot2Error(false);
                }
                setChosenStructure(new ReprocessingStructure(chosenStructure));
              }}
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
            "Implant",
            "Character implant being used to affect the reprocessing efficiency.",
            <ImplantSelect
              {...appShellFieldProps}
              value={chosenStructure.implant}
              jobType={selectedJobType}
              onChange={(selectedEntry) => {
                chosenStructure.setImplant(selectedEntry.id);
                setChosenStructure(new ReprocessingStructure(chosenStructure));
              }}
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
            "Facility tax percentage for using the services at this structure. This is applied when calculating the reprocessing cost.",
            <TaxPercentageTextField
              initialState={chosenStructure.tax}
              onBlur={(value) => {
                chosenStructure.setTax(value);
                setChosenStructure(new ReprocessingStructure(chosenStructure));
              }}
              variant={isFirstLogin ? "outlined" : "standard"}
              label={isFirstLogin ? "Tax %" : undefined}
              helperText={"Tax Percentage"}
              sx={
                isFirstLogin ? (t) => appShellTextFieldOutlinedSx(t) : undefined
              }
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

export default ReprocessingStructureSelection;
