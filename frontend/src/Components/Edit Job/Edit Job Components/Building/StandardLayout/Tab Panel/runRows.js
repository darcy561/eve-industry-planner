/**
 * What an industry run gives a row to draw, for both of the Building stage's
 * lists: the runs ESI offers and the runs the job holds.
 *
 * The two lists take their rows from different places — a run ESI returned
 * names its installer and its `facility_id`, a stored one names the character
 * hash it was linked under and its `station_id` — and a row model is where that
 * difference ends. Everything below a list reads these fields.
 */

import findBlueprintType from "../../../../../../Functions/Shared/findBlueprintType";
import { formatTimeRemaining } from "../../../../../../Functions/Helper/numberParser";
import { UNNAMED_LOCATION_LABEL } from "../../../../../../Functions/Assets/assetLocationConstants";
import {
  finishesAt,
  isReadyToDeliver,
  progressPercent,
} from "../../../../Edit Job Hooks/linkedRunSelectors";

/**
 * One status vocabulary for a run, whether it is linked or only offered.
 *
 * A run waiting to be collected is the one the reader can act on, so it reads
 * as information rather than as the finished state `delivered` holds.
 */
const STATUS_COLOURS = {
  active: "warning",
  delivered: "success",
  cancelled: "error",
};
const READY_COLOUR = "info";
const READY_LABEL = "Ready for Delivery";

/**
 * @typedef {object} RunRow
 * @property {string} key
 * @property {object} run - The run itself, as the command that links or unlinks it takes it
 * @property {object|null} owner - The account character the run belongs to, where one is known
 * @property {number|null} blueprintTypeID
 * @property {string|number|null} blueprintType
 * @property {string} facilityName
 * @property {string} statusLabel
 * @property {string} statusColour
 * @property {number} progress
 * @property {boolean} readyToDeliver
 * @property {string|null} timeRemaining - Only while the run is still running
 * @property {number|null} installCost - Only for a run the job holds
 */

/**
 * Builds the rows for the runs ESI is offering.
 *
 * A run installed by a character the account cannot name is left out, and the
 * counts beside the list read what comes back from here rather than the matches
 * — a run that is not drawn is not one the reader can link, so offering to link
 * it or refusing for want of a slot to put it in would both be answering about
 * something that is not on screen.
 *
 * @param {Array<object>} matches - Industry jobs from ESI that match this job
 * @param {object} context
 * @param {(characterID: number) => object|null} context.characterById
 * @param {Object<string, {name: string}>} context.facilityNames
 * @param {object} context.queryClient
 * @param {number} context.now
 * @returns {Array<RunRow>}
 */
export function availableRunRows(matches, context) {
  return matches
    .map((run) => {
      const owner = context.characterById(run.installer_id);
      if (!owner) return null;
      return runRow(run, {
        ...context,
        owner,
        locationID: run.facility_id,
        endsAt: Date.parse(run.end_date),
        installCost: null,
      });
    })
    .filter(Boolean);
}

/**
 * Builds the rows for the runs the job holds.
 *
 * A stored run stays on the list whether or not its character can still be
 * named: it is already linked, and the reader unlinking it is the only way it
 * comes off.
 *
 * @param {Array<object>} runs - The job's linked runs
 * @param {object} context
 * @param {(characterHash: string) => object|null} context.characterByHash
 * @param {Object<string, {name: string}>} context.facilityNames
 * @param {object} context.queryClient
 * @param {number} context.now
 * @returns {Array<RunRow>}
 */
export function linkedRunRows(runs, context) {
  return runs.map((run) =>
    runRow(run, {
      ...context,
      owner: context.characterByHash(run.CharacterHash),
      locationID: run.station_id,
      endsAt: finishesAt(run),
      installCost: run.cost,
    }),
  );
}

/**
 * @param {object} run
 * @param {object} context
 * @returns {RunRow}
 */
function runRow(run, context) {
  const { owner, locationID, endsAt, installCost, facilityNames, now } =
    context;
  const readyToDeliver = isReadyToDeliver(run, now);

  return {
    key: `run-${run.job_id}`,
    run,
    owner,
    blueprintTypeID: run.blueprint_type_id,
    blueprintType: findBlueprintType(run.blueprint_id, context.queryClient),
    facilityName: facilityNames[locationID]?.name || UNNAMED_LOCATION_LABEL,
    statusLabel: readyToDeliver ? READY_LABEL : titleCase(run.status),
    statusColour: readyToDeliver
      ? READY_COLOUR
      : (STATUS_COLOURS[run.status] ?? "default"),
    progress: progressPercent(run, now),
    readyToDeliver,
    timeRemaining:
      run.status === "active" && endsAt !== null
        ? formatTimeRemaining(endsAt, { now })
        : null,
    installCost: installCost ?? null,
  };
}

/**
 * @param {string} status
 * @returns {string}
 */
function titleCase(status) {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
