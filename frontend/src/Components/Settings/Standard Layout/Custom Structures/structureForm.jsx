import { useMemo, useState } from "react";
import { Box, Button, Stack, TextField } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { StructureField, fieldsFor } from "./structureFields";
import { FormField } from "../../../../Styled Components/Textfield/FormField";
import {
  fieldsForKind,
  structureFromDocument,
  updateStructure,
} from "../../../../Functions/Custom Structures/customStructure";
import useRigSlots from "../../../../Hooks/useRigSlots";
import { addCustomStructure as addCustomStructureFunction } from "../../../../Functions/Custom Structures/addCustomStructure";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import {
  getAppShellMarketSelectProps,
  appShellTextFieldOutlinedSx,
} from "../../../../Context/appShell";
import {
  requirements,
  rigTypeMap,
  systemStructureRequirements,
  structureTypeMap,
  systemTypeMap,
} from "../../../../Context/defaultValues";
import GLOBAL_CONFIG from "../../../../global-config-app";

const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;

/**
 * What a new structure of a kind starts as: the first option in each picker the
 * kind carries, which `fieldsForKind` decides.
 */
function blankStructure(jobType) {
  const seed = { jobType };
  const fields = fieldsForKind(jobType);

  if (fields.built) {
    seed.structureType = structureTypeMap[jobType]?.[0]?.id ?? 0;
    seed.systemType = systemTypeMap[jobType]?.[0]?.id ?? 0;
    seed.tax = 0;
  }
  if (fields.rigSlots) {
    seed.rigSlot1 = rigTypeMap[jobType]?.[0]?.id ?? 0;
    seed.rigSlot2 = rigTypeMap[jobType]?.[0]?.id ?? 0;
  }
  if (fields.systemID) seed.systemID = DEFAULT_SYSTEM;

  return structureFromDocument(seed);
}

/**
 * Describing a structure of any kind: one form, rendering the control for each
 * field the kind's entry in the field map names.
 *
 * @param {{selectedJobType: number, setIsLoading: Function}} props
 */
export default function StructureForm({ selectedJobType, setIsLoading }) {
  const theme = useTheme();
  const fieldProps = useMemo(
    () => getAppShellMarketSelectProps(theme),
    [theme],
  );
  const textFieldSx = useMemo(() => (t) => appShellTextFieldOutlinedSx(t), []);

  const { addCustomStructure } =
    useUsersStore.getState().applicationSettings.actions;

  const [structure, setStructure] = useState(() =>
    blankStructure(selectedJobType),
  );
  const [nameError, setNameError] = useState(false);

  const fields = fieldsForKind(structure.jobType);

  const change = (changes) =>
    setStructure((current) => updateStructure(current, changes));

  const rigSlots = useRigSlots(structure, (slot, rigID) =>
    change({ [slot]: rigID }),
  );

  /**
   * A preset structure type carries the rest of its setup with it, so choosing
   * one fills the fields it decides rather than leaving them to be matched by
   * hand.
   */
  function applyRequirements(requirementID) {
    const preset =
      requirementID == null || requirementID === -1
        ? null
        : requirements[requirementID];
    if (!preset) return;

    const changes = {};
    if (preset.structureID !== undefined)
      changes.structureType = preset.structureID;
    if (preset.rigID !== undefined) {
      changes.rigSlot1 = preset.rigID;
      changes.rigSlot2 = 0;
    }
    if (preset.taxValue !== undefined) changes.tax = preset.taxValue;
    if (preset.systemID !== undefined) changes.systemID = preset.systemID;
    if (preset.systemTypeID !== undefined)
      changes.systemType = preset.systemTypeID;

    setStructure((current) => updateStructure(current, changes));
  }

  const context = {
    structure,
    jobType: selectedJobType,
    fieldProps,
    textFieldSx,
    rigSlots,
    onStructureType: (entry) => {
      change({ structureType: entry.id });
      applyRequirements(entry.requirementID);
    },
    onSystemType: (entry) => {
      change({ systemType: entry.id });
      applyRequirements(entry.requirementID);
    },
    onImplant: (entry) => change({ implant: entry.id }),
    onTax: (value) => change({ tax: value }),
    onSystem: (systemID) => {
      const preset =
        systemStructureRequirements[systemID]?.requirementID ?? null;
      const allowed = preset == null ? null : requirements[preset];
      if (
        allowed?.allowedJobTypes &&
        !allowed.allowedJobTypes.includes(selectedJobType)
      ) {
        return new Error("This system does not allow this kind of job.");
      }

      change({ systemID });
      applyRequirements(preset);
    },
  };

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
              sx={textFieldSx}
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
