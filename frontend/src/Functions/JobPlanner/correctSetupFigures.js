import Setup from "../../Classes/jobSetup";
import materialQuantitiesForSetup from "../Blueprint Calculations/calculateMaterialsForSetup";
import { readIndustryBonuses } from "../Industry Facilities/industryBonuses";

/**
 * Whether two material counts ask for the same quantity of the same types.
 *
 * @param {Object} stored - What the setup holds
 * @param {Object} rebuilt - What its inputs call for now
 * @returns {boolean}
 * @private
 */
function sameMaterialCount(stored, rebuilt) {
  const held = stored ?? {};
  const wanted = rebuilt ?? {};
  const typeIDs = new Set([...Object.keys(held), ...Object.keys(wanted)]);

  for (const typeID of typeIDs) {
    if (held[typeID]?.quantity !== wanted[typeID]?.quantity) return false;
    if (held[typeID]?.rawQuantity !== wanted[typeID]?.rawQuantity) return false;
  }
  return true;
}

/**
 * The figures a setup works out from its own choices, each with how to work it out
 * again and how to tell whether the stored one still agrees.
 *
 * @type {Array<{field: string, rebuild: (setup: Object, job: Object) => *,
 * matches: (stored: *, rebuilt: *) => boolean}>}
 */
const derivedFigures = [
  {
    field: "materialCount",
    rebuild: (setup, job) =>
      materialQuantitiesForSetup(
        setup,
        job?.rawData?.materials ?? [],
        job?.itemID,
      ),
    matches: sameMaterialCount,
  },
];

/**
 * Brings a job's setups back into step with the choices they were built from, in
 * place, and says which figures on which setups it corrected.
 *
 * Corrects nothing until the bonuses a figure is worked out from have arrived,
 * because a figure rebuilt without them would be wrong in a new way.
 *
 * @param {Object} job - The job, as plain data
 * @returns {Array<{setupID: string, fields: Array<string>}>}
 */
export default function correctSetupFigures(job) {
  const setups = job?.build?.setup;
  if (!setups) return [];
  if (!readIndustryBonuses()) return [];

  const corrected = [];

  for (const [setupID, row] of Object.entries(setups)) {
    if (!row) continue;

    const setup = new Setup(row);
    const drifted = [];

    for (const figure of derivedFigures) {
      const rebuilt = figure.rebuild(setup, job);
      if (figure.matches(setup[figure.field], rebuilt)) continue;

      setup[figure.field] = rebuilt;
      drifted.push(figure.field);
    }

    if (drifted.length === 0) continue;

    setups[setupID] = setup.toDocument();
    corrected.push({ setupID, fields: drifted });
  }

  return corrected;
}
