import { useJobDraft } from "./useJobDraft";
import { materialRequirementOf } from "./jobSelectors";
import {
  excessQuantity,
  purchasedCost,
  quantityImported,
  quantityRemaining,
  quantityPurchased,
} from "./materialSelectors";

/**
 * What a material row comes to on the job: how many it needs, how far the
 * buying has got, and what that cost.
 *
 * The requirement is the reason this is a hook rather than a function of the
 * row: it belongs to the setups, so anything reading a material has to read
 * those too, and a card that took the figures as props would need every one of
 * them threaded down to it.
 *
 * @param {object} material - A material row as the job stores it
 * @returns {{needed: number, purchased: number, remaining: number,
 *   imported: number, excess: number, cost: number, isComplete: boolean}}
 */
export function useMaterialFigures(material) {
  const setups = useJobDraft((job) => job.build.setup);
  const needed = materialRequirementOf(setups, material?.typeID);
  const purchased = quantityPurchased(material, needed);

  return {
    needed,
    purchased,
    remaining: quantityRemaining(material, needed),
    imported: quantityImported(material),
    excess: excessQuantity(material, needed),
    cost: purchasedCost(material, needed),
    isComplete: needed > 0 && purchased >= needed,
  };
}
