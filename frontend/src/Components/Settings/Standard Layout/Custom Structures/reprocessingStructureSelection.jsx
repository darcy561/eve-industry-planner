import { useState } from "react";
import { FormControl, Box, TextField, Button, Grid } from "@mui/material";

import StructureTypeSelect from "../../../../Styled Components/Select/structureType";
import SystemTypeSelect from "../../../../Styled Components/Select/systemType";
import RigTypeSelect from "../../../../Styled Components/Select/rigType";
import ImplantSelect from "../../../../Styled Components/Select/implantSelecter";
import { jobTypes } from "../../../../Context/defaultValues";
import ReprocessingStructure from "../../../../Classes/reprocessingStructure";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import { addCustomStructure as addCustomStructureFunction } from "../../../../Functions/Structure/addCustomStructure";
import useUsersStore from "../../../../Zustand/usersStore";
import { saveApplicationSettings } from "../../../../Functions/Endpoints/Pirivate/userDocument";
import DOMPurify from "dompurify";
import { useGlobalDebounce } from "../../../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../../../Context/debounceKeys";

function ReprocessingStructureSelection({ selectedJobType, setIsLoading }) {
  const { addCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  const [chosenStructure, setChosenStructure] = useState(
    new ReprocessingStructure()
  );
  const [rigSlot1Error, setRigSlot1Error] = useState(false);
  const [rigSlot2Error, setRigSlot2Error] = useState(false);
  const errorText = "Cannot have the same rig or related rigs in both slots";

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await saveApplicationSettings();
    },
    2000
  );

  const handleAdd = async () => {
    try {
      await addCustomStructureFunction({
        structure: chosenStructure,
        addCustomStructure,
        selectedJobType,
        setIsLoading,
      });
      setChosenStructure(new ReprocessingStructure());
      debouncedSaveSettings();
    } catch (error) {
      console.error("Error adding reprocessing structure:" + error);
    }
  };

  const handleNameChange = (e) => {
    chosenStructure.setName(DOMPurify.sanitize(e.target.value, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }));
    setChosenStructure(new ReprocessingStructure(chosenStructure));
  };

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

  return (
    <Box>
      <Grid container>
        <Grid size={12}>
          <FormControl fullWidth sx={styling}>
            <TextField
              placeholder="Display Name"
              value={chosenStructure.name}
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
            value={chosenStructure.structureType}
            jobType={jobTypes.reprocessing}
            onChange={(selectedEntry) => {
              chosenStructure.setStructureType(selectedEntry.id);
              setChosenStructure(new ReprocessingStructure(chosenStructure));
            }}
          />
        </Grid>

        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <SystemTypeSelect
            value={chosenStructure.systemType}
            jobType={jobTypes.reprocessing}
            onChange={(selectedEntry) => {
              chosenStructure.setSystemType(selectedEntry.id);
              setChosenStructure(new ReprocessingStructure(chosenStructure));
            }}
          />
        </Grid>
        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <RigTypeSelect
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
          />
        </Grid>
        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <RigTypeSelect
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
          />
        </Grid>

        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <ImplantSelect
            value={chosenStructure.implant}
            jobType={selectedJobType}
            onChange={(selectedEntry) => {
              chosenStructure.setImplant(selectedEntry.id);
              setChosenStructure(new ReprocessingStructure(chosenStructure));
            }}
          />
        </Grid>
        <Grid
          sx={{ paddingX: "20px" }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <TaxPercentageTextField
            initialState={chosenStructure.tax}
            jobType={selectedJobType}
            onBlur={(value) => {
              chosenStructure.setTax(value);
              setChosenStructure(new ReprocessingStructure(chosenStructure));
            }}
          />
        </Grid>

        <Grid size={12}>
          <Button onClick={handleAdd}>Add</Button>
        </Grid>
      </Grid>
    </Box>
  );
}

export default ReprocessingStructureSelection;
