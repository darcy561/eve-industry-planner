import { TYPE_IMAGE, typeImageUrl } from "../Shared/eveImage";
import { isAncientRelic } from "../Shared/itemCategories";
import { itemNameFrom } from "../Static/items";

/**
 * The image EVE serves for what a node is.
 *
 * Nearly everything is an `icon`. An ancient relic is served only as `relic` — its `icon` is
 * answered with a 400 and no image — so the one exception is asked for by name.
 *
 * @param {import("./buildAssetNodes").AssetNode} node
 * @param {Object<string, {category_id?: number}>} [itemRecords]
 * @returns {string|undefined} undefined when there is no id to ask about
 */
export function assetImageUrl(node, itemRecords) {
  const variation = isAncientRelic(itemRecords?.[node.typeId]?.category_id)
    ? TYPE_IMAGE.RELIC
    : TYPE_IMAGE.ICON;
  return typeImageUrl(node.typeId, variation, 32);
}

/**
 * What a node is called: the item's name, the player's name for it when it carries one, and the
 * compartment it sits in when that needs saying — a corporation's hangar division, which the
 * division's own name gives.
 *
 * @param {import("./buildAssetNodes").AssetNode} node
 * @param {Object<string, {name: string}>} [itemRecords]
 * @param {Map<number, {name: string}>} [containerNames]
 * @param {string} [compartmentName]
 * @returns {string}
 */
export function assetName(
  node,
  itemRecords = {},
  containerNames,
  compartmentName,
) {
  const itemName = itemNameFrom(node.typeId, itemRecords);
  const givenName = containerNames?.get(node.itemId)?.name;

  return [compartmentName, itemName, givenName].filter(Boolean).join(" - ");
}

/**
 * What a location picker says when it has nothing to offer: still looking, unable to look, or
 * nothing there. Without the distinction a failed lookup reads as an account holding nothing.
 *
 * @param {{count: number, isLoading: boolean, isError: boolean}} state
 * @returns {string}
 */
export function locationPickerLabel({ count, isLoading, isError }) {
  if (count > 0) return "Select location";
  if (isLoading) return "Finding locations…";
  if (isError) return "Locations unavailable";
  return "No locations found";
}
