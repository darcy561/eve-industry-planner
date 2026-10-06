import { useState } from "react";
import { Box, Button, Stack, TextField } from "@mui/material";

import {
  StructureField,
  fieldsFor,
} from "../../../../Styled Components/Structure/structureFields";
import { useStructureFieldContext } from "../../../../Styled Components/Structure/useStructureFieldContext";
import { FormField } from "../../../../Styled Components/Textfield/FormField";
import { fieldsForKind } from "../../../../Functions/Custom Structures/customStructure";
import { addCustomStructure as addCustomStructureFunction } from "../../../../Functions/Custom Structures/addCustomStructure";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import { getSystemTypeFromBand } from "../../../../Functions/Industry Facilities/getStructureInfo";
import { jobTypesAllowedIn } from "../../../../Functions/Industry Facilities/placeConstraints";
import {
  blankStructure,
  changeStructure,
} from "../../../../Functions/Custom Structures/structureChanges";

/**
 * Describing a structure of any kind: one form, rendering the control for each
 * field the kind's entry in the field map names.
 *
 * @param {{selectedJobType: number, setIsLoading: Function}} props
 */
export default function StructureForm({ selectedJobType, setIsLoading }) {
  const { addCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  const [structure, setStructure] = useState(() =>
    blankStructure(selectedJobType),
  );
  const [nameError, setNameError] = useState(false);

  const fields = fieldsForKind(structure.jobType);

  const change = (changes) =>
    setStructure((current) => changeStructure(current, changes));

  const context = useStructureFieldContext({
    structure,
    jobType: selectedJobType,
    change,
    onSystem: (systemID, band) => {
      const allowed = jobTypesAllowedIn(systemID);
      if (allowed !== null && !allowed.includes(selectedJobType)) {
        return new Error("This system does not allow this kind of job.");
      }

      const inBand = getSystemTypeFromBand(selectedJobType, band);
      change(inBand ? { systemID, systemType: inBand.id } : { systemID });
    },
  });

  const nameGiven = Boolean(structure.name?.trim());

  async function handleAdd() {
    if (!nameGiven) {
      setNameError(true);
      return;
    }
    try {
      await addCustomStructureFunction({
        structure,
        addCustomStructure,
        setIsLoading,
      });
      setStructure(blankStructure(selectedJobType));
      scheduleDebouncedApplicationSettingsSave();
    } catch (error) {
      console.error("Error adding structure:", error);
    }
  }

  const handleName = (e) => {
    if (e.target.value.trim()) setNameError(false);
    change({ name: e.target.value });
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        <Box sx={{ flexBasis: "100%", minWidth: 0 }}>
          <FormField
            title="Display name"
            description="A label you will see in structure lists to help you identify the structure. It does not need to match an in-game name."
          >
            <TextField
              fullWidth
              placeholder="Display Name"
              value={structure.name}
              size="small"
              variant="outlined"
              label="Structure name"
              error={nameError}
              helperText={
                nameError
                  ? "Give this a name so you can tell it apart in lists."
                  : "Shown in lists only; used to tell structures apart."
              }
              sx={context.textFieldSx}
              onChange={handleName}
              onBlur={handleName}
            />
          </FormField>
        </Box>

        {fieldsFor(fields).map((entry) => (
          <StructureField key={entry.id} entry={entry} context={context} />
        ))}

        <Box sx={{ flexBasis: "100%", minWidth: 0 }}>
          <Stack direction="row" sx={{ pt: 0.5, justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={handleAdd}>
              Add structure
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
