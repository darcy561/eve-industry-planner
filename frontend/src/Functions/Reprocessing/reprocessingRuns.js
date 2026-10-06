import ReprocessingItem from "../../Classes/reprocessingItem";
import { readReprocessingItems } from "../Static/reprocessing";
import { parseReprocessingInput } from "./reprocessingInput";
import { reprocess } from "./engine/reprocess";
import { choosableOre, oreToBuy } from "./selection/oreToBuy";

/**
 * What a pasted list of ore gives in a setup, as the engine's result, with each line it could not
 * read.
 *
 * @param {string} inputString - ore names and quantities, one per line
 * @param {ReturnType<typeof import("./engine/reprocessingSetup").reprocessingSetupFrom>} setup
 * @returns {{result: ReturnType<typeof reprocess>,
 *   notReprocessable: Array<{name: string, id: number, quantity: number}>, unread: Array<string>}}
 */
export function toMineralsAnswer(inputString, setup) {
  const { items, notReprocessable, unread } =
    parseReprocessingInput(inputString);
  const result = reprocess(
    items.map((item) => ({ typeID: item.id, quantity: item.totalQuantity })),
    setup,
  );
  return { result, notReprocessable, unread };
}

/**
 * The types a To minerals answer is priced on: the items pasted and everything they give.
 *
 * @param {ReturnType<typeof reprocess>} result
 * @returns {Array<string>}
 */
export function typesPricedByToMinerals(result) {
  const types = new Set();
  for (const item of result.items) {
    types.add(String(item.typeID));
    for (const typeID of Object.keys(item.outputs)) types.add(typeID);
  }
  return [...types];
}

/**
 * The types a From minerals answer is priced on whatever was pasted: every ore the solver may
 * choose and everything each gives.
 *
 * @returns {Array<string>}
 */
export function typesPricedByFromMinerals() {
  const types = new Set();
  for (const entry of choosableOre()) {
    types.add(String(entry.id));
    for (const id of Object.keys({
      ...entry.materials,
      ...entry.randomizedMaterials,
    })) {
      types.add(id);
    }
  }
  return [...types];
}

/**
 * Which ore to buy for the minerals a player asked for under a planner's reprocessing settings, the
 * cheapest the prices offer in whole batches, each as a reprocessing item holding its run's outputs.
 *
 * @param {Object<string, {id: number, quantity: number}>} requestedMinerals - as parseInputMineralString reads them
 * @param {ReturnType<typeof import("./engine/reprocessingSetup").reprocessingSetupFrom>} setup
 * @param {(typeID: string) => number} priceOf - one unit's price
 * @param {ReturnType<typeof import("../../Context/defaultValues").defaultPlannerReprocessingSettings>} settings
 * @returns {{oreSelection: Array<ReprocessingItem>, outright: Array<{typeID: string, quantity: number}>}}
 */
export function fromMineralsAnswer(
  requestedMinerals,
  setup,
  priceOf,
  settings,
) {
  const plan = oreToBuy(
    Object.fromEntries(
      Object.values(requestedMinerals).map(({ id, quantity }) => [
        id,
        quantity,
      ]),
    ),
    setup,
    {
      compressedOre: settings.compressedOre,
      buyOutright: settings.buyOutright,
      neverChoose: settings.neverChoose,
      shipping: settings.shipping,
    },
    priceOf,
  );
  const entries = readReprocessingItems();
  const oreSelection = plan.ores.map(({ typeID, quantity }) => {
    const item = new ReprocessingItem(entries[typeID]);
    const [run] = reprocess([{ typeID, quantity }], setup).items;
    item.setTotalQuantity(quantity);
    item.percentageYield = run.yield;
    item.reprocessedMaterials = Object.fromEntries(
      Object.entries(run.outputs).map(([id, given]) => [
        id,
        given / run.batches,
      ]),
    );
    item.unitPrice = priceOf(typeID);
    return item;
  });

  return { oreSelection, outright: plan.outright };
}
