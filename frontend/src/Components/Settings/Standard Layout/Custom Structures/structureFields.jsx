import { Grid } from "@mui/material";

import { FormField } from "../../../../Styled Components/Textfield/FormField";
import StructureTypeSelect from "../../../../Styled Components/Select/structureType";
import SystemTypeSelect from "../../../../Styled Components/Select/systemType";
import RigTypeSelect from "../../../../Styled Components/Select/rigType";
import ImplantSelect from "../../../../Styled Components/Select/implantSelector";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import VirtualisedSystemSearch from "../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import VirtualisedLocationSearch from "../../../../Styled Components/autocomplete/virtualisedLocationSearch";

const RIG_HELP =
  "A structure carries two rig slots. Rigs that compete for the same purpose cannot be fitted together.";

/**
 * Every field a structure can carry, and what decides whether a kind shows it.
 *
 * `shows` is read against the kind's entry in the class's own field map, so the
 * map that decides what a row **stores** is the map that decides what the form
 * **asks for**. A kind gaining a field gains its control with no edit here, and
 * a field nothing stores cannot be asked for.
 *
 * Order is the order a reader meets them.
 *
 * @type {Array<{
 *   id: string,
 *   shows: (fields: object, structure: object) => boolean,
 *   title: string,
 *   description: string,
 *   describe?: (context: object) => string|null,
 *   width?: number,
 *   render: (context: object) => React.ReactNode,
 * }>}
 */
export const STRUCTURE_FIELDS = [
  {
    id: "place",
    shows: (fields) => Boolean(fields.stationID || fields.structureID),
    title: "Location",
    description:
      "The market this is. Offered from the places your characters keep things, because a market you sell at is somewhere you have docked.",
    width: 12,
    // A place whose region could not be read is as unusable as one that could
    // not be listed, so it is said where the field is described rather than
    // left for the reader to find when nothing prices.
    describe: ({ placeError }) => placeError,
    render: ({ structure, places, placeError, onPlace }) => (
      <VirtualisedLocationSearch
        places={places.locations}
        value={structure.stationID || structure.structureID || ""}
        isLoading={places.isLoading}
        isError={places.isError || Boolean(placeError)}
        label="Market location"
        onChange={onPlace}
      />
    ),
  },
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
    id: "brokerFee",
    // Only once a citadel is the place chosen. An NPC station's fee comes from
    // the seller's skills and standings, so there is nothing to ask for, and
    // asking before a place is named would ask about nowhere.
    shows: (fields, structure) =>
      Boolean(fields.brokerFee && structure?.structureID),
    title: "Broker fee",
    description:
      "The rate this citadel's owner set. Nothing can work it out, so it is the figure the structure shows you in game.",
    render: ({ structure, textFieldSx, onBrokerFee }) => (
      <TaxPercentageTextField
        initialState={structure.brokerFee}
        onBlur={onBrokerFee}
        variant="outlined"
        label="Broker fee %"
        helperText="The owner's rate"
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
 * A few fields wait on what has been filled in already: a market asks a citadel
 * for its fee and access character, and asks a station for neither.
 *
 * @param {object} fields - The kind's entry from the class's field map
 * @param {object} [structure] - What has been described so far
 * @returns {typeof STRUCTURE_FIELDS}
 */
export function fieldsFor(fields, structure) {
  return STRUCTURE_FIELDS.filter((entry) => entry.shows(fields, structure));
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
