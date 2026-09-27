import { Grid } from "@mui/material";

import { FormField } from "../../../../Styled Components/Textfield/FormField";
import StructureTypeSelect from "../../../../Styled Components/Select/structureType";
import SystemTypeSelect from "../../../../Styled Components/Select/systemType";
import RigTypeSelect from "../../../../Styled Components/Select/rigType";
import ImplantSelect from "../../../../Styled Components/Select/implantSelector";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import VirtualisedSystemSearch from "../../../../Styled Components/autocomplete/virtualisedSystemSearch";

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
    description:
      "The structure type determines the bonuses and available rigs.",
    render: ({ structure, jobType, fieldProps, onStructureType }) => (
      <StructureTypeSelect
        {...fieldProps}
        value={structure.structureType}
        jobType={jobType}
        onChange={onStructureType}
      />
    ),
  },
  {
    id: "rigSlot1",
    shows: (fields) => Boolean(fields.rigSlots),
    title: "Rig slot 1",
    description: RIG_HELP,
    render: ({ structure, jobType, fieldProps, rigSlots }) => (
      <RigTypeSelect
        {...fieldProps}
        value={structure.rigSlot1}
        jobType={jobType}
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
    render: ({ structure, jobType, fieldProps, rigSlots }) => (
      <RigTypeSelect
        {...fieldProps}
        value={structure.rigSlot2}
        jobType={jobType}
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
    description:
      "The security status of the system determines the effectiveness of the rigs that are fitted to the structure.",
    render: ({ structure, jobType, fieldProps, onSystemType }) => (
      <SystemTypeSelect
        {...fieldProps}
        value={structure.systemType}
        jobType={jobType}
        onChange={onSystemType}
      />
    ),
  },
  {
    id: "tax",
    shows: (fields) => Boolean(fields.built),
    title: "Structure Tax",
    description:
      "Facility tax percentage for using the services at this structure. This is applied when calculating install costs for jobs.",
    render: ({ structure, textFieldSx, onTax }) => (
      <TaxPercentageTextField
        initialState={structure.tax}
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
 * One field, laid out and labelled.
 *
 * @param {{entry: object, context: object}} props
 */
export function StructureField({ entry, context }) {
  return (
    <Grid size={{ xs: 12, sm: entry.width ?? 6 }}>
      <FormField
        title={entry.title}
        description={entry.describe?.(context) ?? entry.description}
      >
        {entry.render(context)}
      </FormField>
    </Grid>
  );
}
