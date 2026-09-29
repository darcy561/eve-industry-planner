import { MILITIA_DISCOUNT_PER_LEVEL } from "../../Context/defaultValues";
import { getStructureInfoFromID } from "./getStructureInfo";
import { settledFieldFor } from "./placeConstraints";
import enlistedFactionForSetup, { militiaHolding } from "./enlistedFaction";

/**
 * How much the holding faction's upgrades take off a job's install cost, which is
 * only ever given in its own NPC stations to its own militia.
 *
 * @param {Object} setup - The setup being costed
 * @returns {number} A share of the index-derived cost, from 0 to 0.5
 */
export default function militiaDiscountForSetup(setup) {
  const holding = militiaHolding(setup?.systemID);
  if (!holding) return 0;
  if (holding !== enlistedFactionForSetup(setup)) return 0;

  const structure = getStructureInfoFromID(
    setup?.jobType,
    settledFieldFor(setup, "structureID", setup?.structureID),
  );
  if (!structure?.npcStation) return 0;

  const level = Math.min(Math.max(setup?.militiaUpgradeLevel ?? 0, 0), 5);
  return level * MILITIA_DISCOUNT_PER_LEVEL;
}
