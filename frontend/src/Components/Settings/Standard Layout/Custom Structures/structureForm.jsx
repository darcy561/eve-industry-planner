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
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../../../Context/defaultValues";
import { getStructureInfoFromID } from "../../../../Functions/Industry Facilities/getStructureInfo";
import { useIndustryBonuses } from "../../../../Hooks/Static/useIndustryBonuses";
import {
  allowedOptionsFor,
  fieldsReleasedBy,
  forcedFieldsFor,
  jobTypesAllowedIn,
  offerableOptions,
} from "../../../../Functions/Industry Facilities/placeConstraints";
import {
  customStructureFieldsFromSetup,
  setupFieldsFromCustomStructure,
} from "../../../../Functions/Custom Structures/customStructureSetup";
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

  /**
   * What the place a structure describes fixes about it, applied over what the
   * reader just chose.
   */
  function settled(draft) {
    const asSetup = {
      ...setupFieldsFromCustomStructure(draft),
      jobType: draft.jobType,
    };
    const fixed = customStructureFieldsFromSetup(forcedFieldsFor(asSetup));

    return updateStructure(draft, fixed);
  }

  /**
   * The fields a place no longer decides once these changes take the structure
   * out of it, named the way a structure names them.
   */
  function releasedBy(current, changes) {
    const before = {
      ...setupFieldsFromCustomStructure(current),
      jobType: current.jobType,
    };
    const after = setupFieldsFromCustomStructure({ ...current, ...changes });

    const letGo = new Set();
    for (const [field, value] of Object.entries(after)) {
      if (before[field] === value) continue;
      for (const name of fieldsReleasedBy(before, field, value))
        letGo.add(name);
    }
    return customStructureFieldsFromSetup(
      Object.fromEntries([...letGo].map((name) => [name, null])),
    );
  }

  const change = (changes) =>
    setStructure((current) => {
      const blank = blankStructure(current.jobType);
      const letGo = Object.fromEntries(
        Object.keys(releasedBy(current, changes)).map((name) => [
          name,
          blank[name],
        ]),
      );

      return settled(updateStructure(current, { ...letGo, ...changes }));
    });

  const rigSlots = useRigSlots(
    structure,
    (slot, rigID) => change({ [slot]: rigID }),
    structure.jobType,
  );

  const optionsFor = (field) => {
    const asSetup = {
      ...setupFieldsFromCustomStructure(structure),
      jobType: structure.jobType,
    };
    const candidates = {
      structureID: offerableOptions(structureTypeMap[structure.jobType]),
      systemTypeID: offerableOptions(systemTypeMap[structure.jobType]),
      rigSlot1: offerableOptions(rigTypeMap[structure.jobType]),
      rigSlot2: offerableOptions(rigTypeMap[structure.jobType]),
    }[field];

    return allowedOptionsFor(asSetup, field, candidates ?? []);
  };

  const isFixed = (field) =>
    Object.hasOwn(
      forcedFieldsFor({
        ...setupFieldsFromCustomStructure(structure),
        jobType: structure.jobType,
      }),
      field,
    );

  const { catalogue } = useIndustryBonuses();
  const rigSize = getStructureInfoFromID(
    structure.jobType,
    structure.structureType,
  )?.rigSize;

  const context = {
    structure,
    jobType: selectedJobType,
    fieldProps,
    textFieldSx,
    rigSlots,
    optionsFor,
    isFixed,
    rigSize,
    catalogue,
    onStructureType: (entry) => change({ structureType: entry.id }),
    onSystemType: (entry) => change({ systemType: entry.id }),
    onImplant: (entry) => change({ implant: entry.id }),
    onTax: (value) => change({ tax: value }),
    onSystem: (systemID) => {
      const allowed = jobTypesAllowedIn(systemID);
      if (allowed !== null && !allowed.includes(selectedJobType)) {
        return new Error("This system does not allow this kind of job.");
      }

      change({ systemID });
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
