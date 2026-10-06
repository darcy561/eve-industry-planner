import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";

import useRigSlots from "../../Hooks/useRigSlots";
import { useIndustryBonuses } from "../../Hooks/Static/useIndustryBonuses";
import {
  getAppShellMarketSelectProps,
  appShellTextFieldOutlinedSx,
} from "../../Context/appShell";
import {
  rigTypeMap,
  structureTypeMap,
  systemTypeMap,
} from "../../Context/defaultValues";
import { getStructureInfoFromID } from "../../Functions/Industry Facilities/getStructureInfo";
import {
  allowedOptionsFor,
  forcedFieldsFor,
  offerableOptions,
} from "../../Functions/Industry Facilities/placeConstraints";
import { structureAsSetup } from "../../Functions/Custom Structures/structureChanges";

/**
 * What the structure fields render from for one structure: its app-shell styling, rig slots, the
 * options its place allows and fixes, and handlers that hand each change to `change`.
 *
 * @param {object} params
 * @param {object} params.structure - The structure being described
 * @param {number} params.jobType - The kind of structure
 * @param {(changes: object) => void} params.change - Applies changed fields to the structure
 * @param {(systemID: number, band: string) => Error|void} [params.onSystem] - Places it in a system
 * @returns {object} The context `StructureField` renders from
 */
export function useStructureFieldContext({
  structure,
  jobType,
  change,
  onSystem,
}) {
  const theme = useTheme();
  const fieldProps = useMemo(
    () => getAppShellMarketSelectProps(theme),
    [theme],
  );
  const textFieldSx = useMemo(() => (t) => appShellTextFieldOutlinedSx(t), []);
  const rigSlots = useRigSlots(
    structure,
    (slot, rigID) => change({ [slot]: rigID }),
    structure.jobType,
  );
  const { catalogue } = useIndustryBonuses();

  const asSetup = structureAsSetup(structure);
  const optionsFor = (field) => {
    const candidates = {
      structureID: offerableOptions(structureTypeMap[structure.jobType]),
      systemTypeID: offerableOptions(systemTypeMap[structure.jobType]),
      rigSlot1: offerableOptions(rigTypeMap[structure.jobType]),
      rigSlot2: offerableOptions(rigTypeMap[structure.jobType]),
    }[field];
    return allowedOptionsFor(asSetup, field, candidates ?? []);
  };
  const isFixed = (field) => Object.hasOwn(forcedFieldsFor(asSetup), field);

  return {
    structure,
    jobType,
    fieldProps,
    textFieldSx,
    rigSlots,
    optionsFor,
    isFixed,
    rigSize: getStructureInfoFromID(structure.jobType, structure.structureType)
      ?.rigSize,
    catalogue,
    onStructureType: (entry) => change({ structureType: entry.id }),
    onSystemType: (entry) => change({ systemType: entry.id }),
    onImplant: (entry) => change({ implant: entry.id }),
    onTax: (value) => change({ tax: value }),
    onSystem,
  };
}
