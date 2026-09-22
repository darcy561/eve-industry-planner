import { useMemo, useState } from "react";
import { Box, Button, Grid, Stack, TextField } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { StructureField, fieldsFor } from "./structureFields";
import { FormField } from "../../../../Styled Components/Textfield/FormField";
import Structure from "../../../../Classes/structure";
import useRigSlots from "./useRigSlots";
import { addCustomStructure as addCustomStructureFunction } from "../../../../Functions/Structure/addCustomStructure";
import { showSnackbarSuccess } from "../../../../Events/snackbarEvents";
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
 * What a new structure of a kind starts as.
 *
 * Only the kinds that carry a field are given one, because the class drops what
 * its kind does not name — passing a system to invention would be discarded, and
 * reading it back as a default would be a lie about what was stored.
 */
function blankStructure(jobType) {
  const seed = { jobType };
  const fields = new Structure(undefined, jobType).fields;

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

  return new Structure(seed);
}

/**
 * Describing a structure of any kind.
 *
 * One form rather than one per kind: what a kind carries is a row in the
 * class's field map, and this renders the control for each field that row
 * names. A kind gaining a field gains its control, and a kind that does not
 * carry one is never asked for it.
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

  const fields = structure.fields;

  const settled = (mutate) => {
    mutate(structure);
    setStructure(new Structure(structure));
  };

  const rigSlots = useRigSlots(structure, (next) =>
    setStructure(new Structure(next)),
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

    if (preset.structureID !== undefined)
      structure.setStructureType(preset.structureID);
    if (preset.rigID !== undefined) {
      structure.setRigSlot1(preset.rigID);
      structure.setRigSlot2(0);
    }
    if (preset.taxValue !== undefined) structure.setTax(preset.taxValue);
    if (preset.systemID !== undefined) structure.setSystemID(preset.systemID);
    if (preset.systemTypeID !== undefined)
      structure.setSystemType(preset.systemTypeID);

    setStructure(new Structure(structure));
  }

  const context = {
    structure,
    jobType: selectedJobType,
    fieldProps,
    textFieldSx,
    rigSlots,
    onStructureType: (entry) => {
      structure.setStructureType(entry.id);
      setStructure(new Structure(structure));
      applyRequirements(entry.requirementID);
    },
    onSystemType: (entry) => {
      structure.setSystemType(entry.id);
      setStructure(new Structure(structure));
      applyRequirements(entry.requirementID);
    },
    onImplant: (entry) => settled((s) => s.setImplant(entry.id)),
    onTax: (value) => settled((s) => s.setTax(value)),
    // A system can carry a preset of its own, and can refuse a kind of job
    // outright — the Fulcrum is manufacturing only. Refusing here is what stops
    // a structure being saved somewhere its jobs cannot run.
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

      structure.setSystemID(systemID);
      setStructure(new Structure(structure));
      applyRequirements(preset);
    },
  };

  // The name is how a reader tells one saved row from another: every picker
  // lists them by it, so a nameless row is an empty option among other empty
  // options. Refused here rather than filled in with a stand-in, because only
  // the reader knows which of their structures this is.
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
      showSnackbarSuccess(`${structure.name} Added`);
    } catch (error) {
      console.error("Error adding structure:", error);
    }
  }

  const handleName = (e) => {
    if (e.target.value.trim()) setNameError(false);
    settled((s) => s.setName(e.target.value));
  };

  return (
    <Box>
      <Grid container spacing={2} sx={{ alignItems: "flex-start" }}>
        <Grid size={12}>
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
        </Grid>

        {fieldsFor(fields).map((entry) => (
          <StructureField key={entry.id} entry={entry} context={context} />
        ))}

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
