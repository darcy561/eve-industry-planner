import { Box } from "@mui/material";

import { FormField } from "../Textfield/FormField";
import { jobTypes } from "../../Context/defaultValues";
import StructureTypeSelect from "../Select/structureType";
import SystemTypeSelect from "../Select/systemType";
import VirtualisedRigSearch from "../autocomplete/virtualisedRigSearch";
import ImplantSelect from "../Select/implantSelector";
import TaxPercentageTextField from "../Textfield/tax";
import VirtualisedSystemSearch from "../autocomplete/virtualisedSystemSearch";

const RIG_HELP =
  "A structure carries two rig slots. Rigs that compete for the same purpose cannot be fitted together.";

/**
 * Every field a structure can carry, in the order a reader meets them, with
 * `shows` read against the same field map that decides what a row stores.
 *
 * @type {Array<{
 *   id: string,
 *   shows: (fields: object) => boolean,
 *   title: string,
 *   shortTitle?: string|((context: object) => string),
 *   description: string,
 *   describe?: (context: object) => string|null,
 *   width?: number,
 *   render: (context: object) => React.ReactNode,
 * }>}
 */
export const STRUCTURE_FIELDS = [
  {
    id: "structureType",
    shows: (fields) => Boolean(fields.built),
    title: "Structure Type",
    shortTitle: "Structure",
    description:
      "The structure type determines the bonuses and available rigs.",
    render: ({
      structure,
      jobType,
      fieldProps,
      onStructureType,
      optionsFor,
    }) => (
      <StructureTypeSelect
        {...fieldProps}
        value={structure.structureType}
        jobType={jobType}
        options={optionsFor("structureID")}
        onChange={onStructureType}
      />
    ),
  },
  {
    id: "rigSlot1",
    shows: (fields) => Boolean(fields.rigSlots),
    title: "Rig slot 1",
    description: RIG_HELP,
    render: ({ structure, jobType, rigSlots, rigSize, catalogue }) => (
      <VirtualisedRigSearch
        value={structure.rigSlot1}
        jobType={jobType}
        rigSize={rigSize}
        catalogue={catalogue}
        label="Rig slot 1"
        appShellStyled
        error={rigSlots.slot1.error}
        onChange={rigSlots.slot1.onChange}
      />
    ),
  },
  {
    id: "rigSlot2",
    shows: (fields) => Boolean(fields.rigSlots),
    title: "Rig slot 2",
    description: RIG_HELP,
    render: ({ structure, jobType, rigSlots, rigSize, catalogue }) => (
      <VirtualisedRigSearch
        value={structure.rigSlot2}
        jobType={jobType}
        rigSize={rigSize}
        catalogue={catalogue}
        label="Rig slot 2"
        appShellStyled
        error={rigSlots.slot2.error}
        onChange={rigSlots.slot2.onChange}
      />
    ),
  },
  {
    id: "implant",
    shows: (fields) => Boolean(fields.implant),
    title: "Implant",
    description:
      "A reprocessing implant raises the yield, and is worn by whoever runs the job.",
    render: ({ structure, jobType, fieldProps, onImplant }) => (
      <ImplantSelect
        {...fieldProps}
        value={structure.implant}
        jobType={jobType}
        onChange={onImplant}
      />
    ),
  },
  {
    id: "systemType",
    shows: (fields) => Boolean(fields.built),
    title: "Security Status",
    shortTitle: "System security",
    description:
      "The security status of the system determines the effectiveness of the rigs that are fitted to the structure.",
    render: ({ structure, jobType, fieldProps, onSystemType, optionsFor }) => (
      <SystemTypeSelect
        {...fieldProps}
        value={structure.systemType}
        jobType={jobType}
        options={optionsFor("systemTypeID")}
        onChange={onSystemType}
      />
    ),
  },
  {
    id: "tax",
    shows: (fields) => Boolean(fields.built),
    title: "Structure Tax",
    shortTitle: ({ jobType }) =>
      jobType === jobTypes.reprocessing ? "Reprocessing tax" : "Tax",
    description:
      "Facility tax percentage for using the services at this structure. This is applied when calculating install costs for jobs.",
    describe: ({ jobType }) =>
      jobType === jobTypes.reprocessing
        ? "The share of what is reprocessed that the structure charges for its refinery."
        : null,
    render: ({ structure, textFieldSx, onTax, isFixed }) => (
      <TaxPercentageTextField
        initialState={structure.tax}
        disabled={isFixed("taxValue")}
        onBlur={onTax}
        variant="outlined"
        label="Tax %"
        helperText="Tax Percentage"
        sx={textFieldSx}
      />
    ),
  },
  {
    id: "systemID",
    shows: (fields) => Boolean(fields.systemID),
    title: "Solar System",
    description:
      "Where this structure is situated. This is used to fetch the system indexes of the system.",
    render: ({ structure, jobType, onSystem }) => (
      <VirtualisedSystemSearch
        selectedValue={structure.systemID}
        jobType={jobType}
        updateSelectedValue={onSystem}
        appShellStyled
      />
    ),
  },
];

/**
 * The fields a kind asks for, in reading order.
 *
 * @param {object} fields - The kind's entry from the field map
 * @returns {typeof STRUCTURE_FIELDS}
 */
export function fieldsFor(fields) {
  return STRUCTURE_FIELDS.filter((entry) => entry.shows(fields));
}

/**
 * One field, laid out and labelled; `compact` drops its description and helper caption and takes
 * its short name, for a side column.
 *
 * @param {{entry: object, context: object, compact?: boolean}} props
 */
export function StructureField({ entry, context, compact = false }) {
  const basis = entry.width === 12 ? "100%" : "calc(50% - 8px)";
  const shortTitle =
    typeof entry.shortTitle === "function"
      ? entry.shortTitle(context)
      : entry.shortTitle;
  return (
    <Box
      sx={{
        flexBasis: { xs: "100%", sm: basis },
        minWidth: 0,
        ...(compact
          ? { "& .MuiFormHelperText-root:not(.Mui-error)": { display: "none" } }
          : {}),
      }}
    >
      <FormField
        title={compact ? (shortTitle ?? entry.title) : entry.title}
        description={
          compact ? null : (entry.describe?.(context) ?? entry.description)
        }
      >
        {entry.render(context)}
      </FormField>
    </Box>
  );
}
