import {
  isShipHoldFlag,
  LOCATION_KIND,
  resolveLocationKind,
} from "./assetLocationConstants";

/**
 * The wrapper ESI puts between a station and a corporation's hangar divisions.
 *
 * @type {string}
 */
export const OFFICE_FOLDER_FLAG = "OfficeFolder";

/**
 * Flags that only ever describe sitting at a place — a station or a structure — rather than being
 * inside something held there.
 *
 * A corporation owns the structures it built, so the structure is one of its own asset rows, sitting
 * in the solar system the way a ship in space does. Without this, an office inside it resolves past
 * the structure to that system, and everything in the office reads as being in space.
 *
 * @type {Set<string>}
 */
const PLACE_FLAGS = new Set([
  OFFICE_FOLDER_FLAG,
  "Hangar",
  "Deliveries",
  "CorpDeliveries",
  "CorporationGoalDeliveries",
  "AssetSafety",
]);

/**
 * @typedef {Object} AssetNode
 * @property {number} itemId
 * @property {number} typeId
 * @property {number} quantity
 * @property {string} flag - `location_flag` exactly as ESI gives it
 * @property {number|null} parentId - holding asset's `item_id`, or null when held by a location
 * @property {number[]} childIds - ordered by type then item id; empty for leaves
 * @property {number} locationId - the station, structure or system it ultimately sits in
 * @property {string} locationKind - what that location is; see `LOCATION_KIND`
 * @property {string} rootFlag - the compartment it sits in at that location
 * @property {number} depth - distance from that location
 * @property {boolean} isSingleton - assembled, or otherwise unable to stack
 * @property {import("../Shared/ownerKind").EveOwner|null} owner - whose set the row came from
 * @property {string|null} seenBy - the character whose request returned the row; for a corporation
 *   that is the member whose roles reached it, which is not who owns it
 */

/**
 * @typedef {Object} AssetCollection
 * @property {AssetNode[]} nodes - input order
 * @property {Map<number, AssetNode>} byItemId
 */

/**
 * Normalises raw ESI asset rows into nodes carrying their resolved location and compartment.
 *
 * Pure and synchronous: location and container *names* are resolved elsewhere, so a consumer
 * that only counts quantities never waits on a round trip.
 *
 * @param {Array<Object>} [rows] - raw ESI asset rows
 * @returns {AssetCollection}
 */
export default function buildAssetNodes(rows = []) {
  return buildAssetCollection([rows], [null]);
}

/**
 * One collection from several owners' rows at once.
 *
 * Nothing on an ESI asset row says whose it is — the answer is which request returned it — so the
 * owner is attached here, where the sets are still separate. Merged afterwards there is no way back
 * to it, and a view spanning several characters cannot say which of them holds a stack.
 *
 * The character that fetched a set is kept beside its owner. A corporation's rows arrive once per
 * member whose roles reach them, and that member is the one character known to be able to see where
 * they sit — which is what spares a structure's name lookup a refusal from everybody else.
 *
 * @param {Array<Array<Object>>} [sources] - raw ESI asset rows, one array per request
 * @param {Array<{owner: import("../Shared/ownerKind").EveOwner|null, seenBy: string|null}|null>} [from] - parallel to `sources`
 * @returns {AssetCollection}
 */
export function buildAssetCollection(sources = [], from = []) {
  const byItemId = new Map();
  const nodes = [];

  sources.forEach((rows, index) => {
    const { owner, seenBy } = from[index] ?? { owner: null, seenBy: null };

    for (const row of rows ?? []) {
      if (!row || row.item_id == null) continue;
      // A corporation's set is the union of its members' views, so the same row arrives once per
      // member that can see it.
      if (byItemId.has(row.item_id)) continue;

      const node = {
        itemId: row.item_id,
        typeId: row.type_id,
        quantity: row.quantity ?? 0,
        flag: row.location_flag,
        parentId: null,
        childIds: [],
        locationId: row.location_id,
        locationKind: resolveLocationKind(row.location_id),
        rootFlag: row.location_flag,
        depth: 0,
        isSingleton: Boolean(row.is_singleton),
        owner,
        seenBy: seenBy ?? null,
      };

      byItemId.set(node.itemId, node);
      nodes.push(node);
    }
  });

  for (const node of nodes) {
    // A holder outside the set is a location: resolution stops there. That is routine rather
    // than an error — a corporation member sees only the offices their roles reach, and a ship
    // flying in space is absent from the set while its fitted modules are not.
    const holder = byItemId.get(node.locationId);
    if (!holder || holder === node) {
      // A ship's item id and a structure's id share a range, so the id alone reads as a structure.
      // What the module is filed in tells them apart: only a ship has fitting slots and bays. Left
      // as a structure, this id is asked of ESI as a place — a lookup that is refused for every
      // character, every time, and spends five times a hit's cost against the error budget doing it.
      if (isShipHoldFlag(node.flag)) node.locationKind = LOCATION_KIND.SHIP;
      continue;
    }
    // A holder the set does contain is still the answer when the flag says the node sits at a
    // place: that holder is the station or structure, and it has a location of its own.
    if (PLACE_FLAGS.has(node.flag)) continue;

    node.parentId = holder.itemId;
    holder.childIds.push(node.itemId);
  }

  const resolved = new Set();
  const pending = [];

  for (const node of nodes) {
    if (node.parentId !== null) continue;
    resolved.add(node.itemId);
    pending.push(node);
  }
  descend(pending, byItemId, resolved);

  for (const node of nodes) {
    if (resolved.has(node.itemId)) continue;

    // Only a cyclic chain survives the descent, but an unresolved node may merely hang beneath
    // one. Walk up to the node that closes the cycle and cut there, so a consumer walking
    // parentId upwards terminates without well-formed rows below it losing their holder.
    const seen = new Set([node.itemId]);
    let onCycle = node;
    while (onCycle.parentId !== null && !seen.has(onCycle.parentId)) {
      seen.add(onCycle.parentId);
      onCycle = byItemId.get(onCycle.parentId);
    }

    const holder = byItemId.get(onCycle.parentId);
    holder.childIds = holder.childIds.filter((id) => id !== onCycle.itemId);
    onCycle.parentId = null;

    resolved.add(onCycle.itemId);
    descend([onCycle], byItemId, resolved);
  }

  for (const node of nodes) {
    node.childIds.sort((a, b) => {
      const left = byItemId.get(a);
      const right = byItemId.get(b);
      return left.typeId - right.typeId || left.itemId - right.itemId;
    });
  }

  return { nodes, byItemId };
}

/**
 * Pushes each root's resolved location and compartment down through its descendants.
 *
 * @param {AssetNode[]} queue - roots to descend from; extended in place as children are reached
 * @param {Map<number, AssetNode>} byItemId
 * @param {Set<number>} resolved
 */
function descend(queue, byItemId, resolved) {
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index];

    for (const childId of parent.childIds) {
      const child = byItemId.get(childId);
      if (resolved.has(child.itemId)) continue;

      child.locationId = parent.locationId;
      child.locationKind = parent.locationKind;
      child.depth = parent.depth + 1;
      // An office folder is a wrapper, not a compartment: the hangar divisions sit inside it, so
      // an item in CorpSAG3 must read CorpSAG3 rather than inheriting OfficeFolder.
      child.rootFlag =
        parent.flag === OFFICE_FOLDER_FLAG ? child.flag : parent.rootFlag;

      resolved.add(child.itemId);
      queue.push(child);
    }
  }
}
