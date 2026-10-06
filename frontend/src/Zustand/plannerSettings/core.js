import {
  compressedOreChoices,
  defaultPlannerReprocessingSettings,
  extrasCategoriesDefault,
  shippingModes,
} from "../../Context/defaultValues";
import customStructuresFromServer from "../../Functions/Custom Structures/customStructuresFromServer";

/**
 * The settings a planner falls back to before its document has been read.
 *
 * @returns {object}
 */
export const plannerSettingsDefault = () => ({
  customStructures: [],
  defaultMaterialEfficiencyValue: 0,
  predefinedSystemIndexes: {},
  extrasCategories: extrasCategoriesDefault,
  marketLocations: [],
  defaultCitadelBrokersFee: 1,
  reprocessingSettings: defaultPlannerReprocessingSettings(),
  exemptTypeIDs: new Set(),
});

/**
 * The planner settings slice's starting state: settings per owner handle, whether each planner has
 * its own, and which fields each holds an unsaved edit to.
 *
 * @returns {{byOwner: Object<string, object>, seededByOwner: Object<string, boolean>,
 *   unsavedByOwner: Object<string, Array<string>>}}
 */
export const stateDefault = () => ({
  byOwner: {},
  seededByOwner: {},
  unsavedByOwner: {},
});

/**
 * Server payload merged onto the defaults, so an omitted field reads as its default rather than as
 * undefined.
 *
 * @param {object} incoming - the `settings` object from the API
 * @returns {object}
 */
export function mergePlannerSettings(incoming) {
  const base = plannerSettingsDefault();
  if (!incoming || typeof incoming !== "object") return base;

  return {
    ...base,
    ...incoming,
    customStructures: customStructuresFromServer(incoming.customStructures),
    reprocessingSettings: mergeReprocessingSettings(
      incoming.reprocessingSettings,
    ),
    extrasCategories: Array.isArray(incoming.extrasCategories)
      ? incoming.extrasCategories
      : base.extrasCategories,
    marketLocations: Array.isArray(incoming.marketLocations)
      ? incoming.marketLocations
      : base.marketLocations,
    predefinedSystemIndexes: incoming.predefinedSystemIndexes ?? {},
    exemptTypeIDs: new Set(incoming.exemptTypeIDs ?? []),
  };
}

/**
 * A planner's stored reprocessing settings over the defaults, where a choice it does not recognise
 * or a missing field reads as the default.
 *
 * @param {object} [incoming]
 * @returns {ReturnType<typeof defaultPlannerReprocessingSettings>}
 */
function mergeReprocessingSettings(incoming) {
  const base = defaultPlannerReprocessingSettings();
  if (!incoming || typeof incoming !== "object") return base;
  const shipping = incoming.shipping ?? {};
  return {
    compressedOre: Object.values(compressedOreChoices).includes(
      incoming.compressedOre,
    )
      ? incoming.compressedOre
      : base.compressedOre,
    countLeftoversAsSold: incoming.countLeftoversAsSold === true,
    buyOutright: incoming.buyOutright === true,
    shipping: {
      mode: Object.values(shippingModes).includes(shipping.mode)
        ? shipping.mode
        : base.shipping.mode,
      amount: Number.isFinite(shipping.amount) ? shipping.amount : 0,
    },
    neverChoose: Array.isArray(incoming.neverChoose)
      ? incoming.neverChoose
      : base.neverChoose,
  };
}
