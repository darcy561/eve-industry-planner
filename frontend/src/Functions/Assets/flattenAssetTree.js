import { sortNodesByName } from "./assetTree";
import { assetName } from "./assetPresentation";
import { UNNAMED_LOCATION_LABEL } from "./assetLocationConstants";

/**
 * What a row in the tree stands for.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ASSET_ROW = Object.freeze({
  LOCATION: "location",
  COMPARTMENT: "compartment",
  ITEM: "item",
});

/**
 * @typedef {Object} AssetTreeRow
 * @property {string} key - stable across a refetch, so expansion survives one
 * @property {string} kind - see {@link ASSET_ROW}
 * @property {number} depth - indent level; a location is 0
 * @property {number} index - position among its siblings, which is what the striping follows
 * @property {boolean} expandable
 * @property {string} [label] - for a location or compartment row
 * @property {string} [context] - what a compartment sits in, so its name reads on its own
 * @property {number} [count] - stacks held under a location or compartment, containers included
 * @property {import("./buildAssetNodes").AssetNode} [node] - for an item row
 */

const locationKey = (locationId) => `location:${locationId}`;
const compartmentKey = (locationId, flag) =>
  `compartment:${locationId}:${flag}`;
const itemKey = (itemId) => `item:${itemId}`;

/**
 * The tree as the flat list of rows currently on screen.
 *
 * Expansion is a set of row keys held by the page rather than state inside each row, so opening a
 * location survives the rows being rebuilt when assets refetch. A key names what the row is rather
 * than where it sits, so it survives a reorder too.
 *
 * @param {{
 *   locations: Array<{locationId: number, name: string, rows: Array<import("./buildAssetNodes").AssetNode>}>,
 *   expanded: Set<string>,
 *   byItemId: Map<number, import("./buildAssetNodes").AssetNode>,
 *   itemRecords?: Object<string, {name: string}>,
 *   compartments?: Array<{assetLocationRef: string, name: string}>,
 *   excludeItemIds?: Set<number>,
 *   containerNames?: Map<number, {name: string}>,
 *   search?: string
 * }} view
 * @returns {AssetTreeRow[]}
 */
export default function flattenAssetTree({
  locations = [],
  expanded = new Set(),
  byItemId,
  itemRecords,
  compartments,
  excludeItemIds,
  containerNames,
  search,
}) {
  const flat = [];
  const term = search?.trim().toLowerCase() ?? "";

  for (const { locationId, name, rows: held } of locations) {
    const rows = held.filter((node) => !excludeItemIds?.has(node.itemId));
    const key = locationKey(locationId);

    // A search is answered rather than browsed: what matches is shown open, and a location with
    // nothing matching is not a place the answer is in.
    let matching = null;
    if (term) {
      const wholeLocation = (name ?? "").toLowerCase().includes(term);
      matching = wholeLocation
        ? null
        : matchesUnder(rows, {
            term,
            byItemId,
            itemRecords,
            containerNames,
            excludeItemIds,
          });
      if (matching?.size === 0) continue;
    }
    flat.push({
      key,
      kind: ASSET_ROW.LOCATION,
      depth: 0,
      index: 0,
      // An office holding nothing still has its divisions to show.
      expandable: rows.length > 0 || Boolean(compartments),
      label: name || UNNAMED_LOCATION_LABEL,
      count: countStacks(rows, byItemId, { excludeItemIds, matching }),
    });

    if (!term && !expanded.has(key)) continue;

    if (compartments) {
      pushCompartments(flat, {
        locationId,
        locationName: name,
        rows,
        expanded,
        byItemId,
        itemRecords,
        compartments,
        excludeItemIds,
        matching,
        openAll: Boolean(term),
      });
    } else {
      pushItems(flat, sortNodesByName(rows, itemRecords), 1, {
        expanded,
        byItemId,
        itemRecords,
        excludeItemIds,
        matching,
        openAll: Boolean(term),
      });
    }
  }

  return flat;
}

function pushCompartments(
  flat,
  {
    locationId,
    locationName,
    rows,
    expanded,
    byItemId,
    itemRecords,
    compartments,
    excludeItemIds,
    matching,
    openAll,
  },
) {
  compartments.forEach(({ assetLocationRef, name }, index) => {
    const key = compartmentKey(locationId, assetLocationRef);
    const held = rows.filter(
      (node) =>
        node.rootFlag === assetLocationRef &&
        (!matching || matching.has(node.itemId)),
    );

    flat.push({
      key,
      kind: ASSET_ROW.COMPARTMENT,
      depth: 1,
      index,
      expandable: held.length > 0,
      label: name,
      // Divisions are named the same at every office, so a row says which one it is in.
      context: locationName,
      count: countStacks(held, byItemId, { excludeItemIds, matching }),
    });

    if (!openAll && !expanded.has(key)) return;

    pushItems(flat, sortNodesByName(held, itemRecords), 2, {
      expanded,
      byItemId,
      itemRecords,
      excludeItemIds,
      matching,
      openAll,
    });
  });
}

function pushItems(
  flat,
  nodes,
  depth,
  { expanded, byItemId, itemRecords, excludeItemIds, matching, openAll },
) {
  const shown = matching ? nodes.filter((n) => matching.has(n.itemId)) : nodes;

  shown.forEach((node, index) => {
    const key = itemKey(node.itemId);
    // What is hidden cannot be opened to: a container holding only blueprints is a leaf here.
    const childIds = node.childIds.filter(
      (childId) =>
        !excludeItemIds?.has(childId) && (!matching || matching.has(childId)),
    );
    const expandable = childIds.length > 0;

    flat.push({
      key,
      kind: ASSET_ROW.ITEM,
      depth,
      index,
      expandable,
      node,
    });

    if (!expandable || (!openAll && !expanded.has(key))) return;

    const contents = childIds.map((childId) => byItemId.get(childId));
    pushItems(flat, sortNodesByName(contents, itemRecords), depth + 1, {
      expanded,
      byItemId,
      itemRecords,
      excludeItemIds,
      matching,
      openAll,
    });
  });
}

/**
 * The items at a location on a path to something matching, ancestors included.
 *
 * A container is kept when what is inside it matches, so the player can see which one to open.
 *
 * @param {Array<import("./buildAssetNodes").AssetNode>} rows
 * @param {{term: string, byItemId: Map, itemRecords: Object, containerNames: Map, excludeItemIds: Set<number>}} against
 * @returns {Set<number>} item ids worth showing
 */
function matchesUnder(
  rows,
  { term, byItemId, itemRecords, containerNames, excludeItemIds },
) {
  const keep = new Set();

  function walk(node) {
    let kept = assetName(node, itemRecords, containerNames)
      .toLowerCase()
      .includes(term);

    for (const childId of node.childIds) {
      if (excludeItemIds?.has(childId)) continue;
      if (walk(byItemId.get(childId))) kept = true;
    }

    if (kept) keep.add(node.itemId);
    return kept;
  }

  for (const node of rows) walk(node);
  return keep;
}

/**
 * How many stacks sit under a set of rows, containers counted as well as their contents.
 *
 * What a collapsed location is worth opening for.
 *
 * @param {Array<import("./buildAssetNodes").AssetNode>} rows
 * @param {Map<number, import("./buildAssetNodes").AssetNode>} byItemId
 * @param {{excludeItemIds?: Set<number>, matching?: Set<number>|null}} [narrow]
 * @returns {number}
 */
function countStacks(rows, byItemId, { excludeItemIds, matching } = {}) {
  let held = 0;

  for (const node of rows) {
    if (excludeItemIds?.has(node.itemId)) continue;
    if (matching && !matching.has(node.itemId)) continue;

    held += 1;
    held += countStacks(
      node.childIds.map((childId) => byItemId.get(childId)),
      byItemId,
      { excludeItemIds, matching },
    );
  }

  return held;
}
