import { listingType } from "../../Context/defaultValues";
import { MATERIAL_PLAN } from "./materialSourcingRow";
import { PRICING_RUNG, resolveGroupDefault } from "./pricingSide";

/**
 * How a material row is priced on the Planning stage: what the job's materials
 * would cost on each pricing basis, and whether a row is still an estimate at all.
 */

/**
 * @typedef {object} GroupPricing
 * @property {Object<string, {parent_id?: number}>} marketGroups - The tree
 * @property {Object<string, {market?: string, basis?: string}>} groupDefaults -
 *   The account side's group table
 * @property {(typeID: number) => number|undefined} marketGroupOf - An item's own
 *   market group
 * @property {string} marketRung - Which rung answered defaultMarketSelect
 * @property {string} listingRung - Which rung answered defaultListingSelect
 */

/**
 * Which hub and basis apply to one material row.
 *
 * A row's own override outranks the panel default on each axis independently, so
 * a row can name a hub without naming a basis. This is the one place that rule
 * lives; a second copy of it would let a quoted total disagree with the row it
 * quotes.
 *
 * The market group walk sits between those two, and is why the panel default
 * arrives with the rung that answered it: a group default outranks the account's
 * and the global one, and loses to the job's own choice. Handed a panel value
 * alone there would be no way to tell those apart, and a group would silently
 * overrule a job the player had explicitly set.
 *
 * @param {object} layout - The job's layout, holding materialPriceOverrides
 * @param {number} materialTypeID
 * @param {string} defaultMarketSelect
 * @param {string} defaultListingSelect
 * @param {GroupPricing} [groupPricing] - Absent until the tree has loaded, which
 *   is a normal early state: the ladder then reads as it did before rung 3
 * @returns {{marketSelect: string, listingSelect: string}}
 */
export function getEffectiveMaterialPriceHub(
  layout,
  materialTypeID,
  defaultMarketSelect,
  defaultListingSelect,
  groupPricing,
) {
  const override = layout?.materialPriceOverrides?.[materialTypeID];

  const group = groupPricing
    ? resolveGroupDefault({
        marketGroupID: groupPricing.marketGroupOf?.(materialTypeID),
        marketGroups: groupPricing.marketGroups,
        groupDefaults: groupPricing.groupDefaults,
      })
    : null;

  return {
    marketSelect:
      override?.marketDisplay ??
      beneathTheJob(group?.market, groupPricing?.marketRung) ??
      defaultMarketSelect,
    listingSelect:
      override?.orderDisplay ??
      beneathTheJob(group?.basis, groupPricing?.listingRung) ??
      defaultListingSelect,
  };
}

/**
 * Marks an axis as one the group rung may not answer.
 *
 * `materialCostByBasis` varies the basis to cost each candidate, so for that call
 * the basis is not a rung question at all. It is named rather than borrowing the
 * job's rung, which would read as a job choice that was never made.
 */
const SUPPRESSED = "suppressed";

/**
 * A group's answer, where what it would displace is something it outranks.
 *
 * The walk sits below a job's own choice and above the account's, so a job that
 * named an axis keeps it on every row rather than being reached past.
 *
 * An unnamed rung yields too. A caller that knows about the walk knows which rung
 * answered — the panel resolver returns both — so a missing one is a caller that
 * did not, and guessing it was the account's would let a group overrule a job.
 *
 * @param {string|null|undefined} chosen
 * @param {string|undefined} rung - The rung that answered the panel default
 * @returns {string|undefined}
 */
function beneathTheJob(chosen, rung) {
  if (!chosen) return undefined;
  return rung === PRICING_RUNG.ACCOUNT || rung === PRICING_RUNG.GLOBAL
    ? chosen
    : undefined;
}

/**
 * @typedef {object} BasisOption
 * @property {string} id - One of the listingType ids
 * @property {string} label - Display name
 * @property {number} total - What the job's materials cost on this basis
 * @property {number} delta - That total less the current basis's total
 * @property {boolean} isCurrent - Whether this is the basis in effect
 */

/**
 * What the job's materials cost on each of the four bases, so a player choosing
 * one sees its effect rather than a label.
 *
 * A material carrying its own override keeps it on every basis: the picker sets
 * the panel's default, and an override outranks the default, so a total that
 * ignored overrides would not be the total the player would get.
 *
 * @param {object} params
 * @param {Array<object>} params.materials - The job's materials
 * @param {object} params.layout - The job's layout, holding materialPriceOverrides
 * @param {string} params.marketSelect - The hub in effect
 * @param {string} params.listingSelect - The basis in effect
 * @param {(typeID: number, hub: string, basis: string) => number} params.getPrice
 * @param {GroupPricing} [params.groupPricing]
 * @returns {BasisOption[]}
 */
export function materialCostByBasis({
  materials,
  layout,
  marketSelect,
  listingSelect,
  getPrice,
  groupPricing,
}) {
  const rows = Array.isArray(materials) ? materials : [];

  // The basis is the axis being varied, so nothing below the panel may answer it:
  // a group default naming one would answer every candidate identically and
  // flatten the comparison into one figure repeated four times. Its market still
  // applies, because that axis is not the one being asked about.
  const perCandidate = groupPricing && {
    ...groupPricing,
    listingRung: SUPPRESSED,
  };

  const totalOn = (basis) =>
    rows.reduce((total, material) => {
      const resolved = getEffectiveMaterialPriceHub(
        layout,
        material.typeID,
        marketSelect,
        basis,
        perCandidate,
      );
      const price = getPrice(
        material.typeID,
        resolved.marketSelect,
        resolved.listingSelect,
      );
      return total + price * material.quantity;
    }, 0);

  const totalsById = new Map(
    listingType.map((entry) => [entry.id, totalOn(entry.id)]),
  );
  const current = totalsById.get(listingSelect) ?? 0;

  return listingType.map((entry) => {
    const total = totalsById.get(entry.id) ?? 0;
    return {
      id: entry.id,
      label: entry.name,
      caption: entry.caption,
      description: entry.description,
      total,
      delta: total - current,
      isCurrent: entry.id === listingSelect,
    };
  });
}

/**
 * How many rows are not on the panel's basis, and how many are not estimates at
 * all.
 *
 * An override is otherwise invisible: a row priced against a different hub looks
 * like any other, and the panel it replaced hid the whole list of them behind a
 * dialogue. Counting departures makes one discoverable without opening anything.
 *
 * @param {Array<object>} rows - Rows from buildMaterialSourcingRow
 * @param {string} marketSelect - The panel's hub
 * @param {string} listingSelect - The panel's basis
 * @returns {{overridden: number, purchased: number}}
 */
export function summariseBasisUse(rows, marketSelect, listingSelect) {
  const list = Array.isArray(rows) ? rows : [];

  return {
    overridden: list.filter(
      (row) =>
        (row.marketSelect && row.marketSelect !== marketSelect) ||
        (row.listingSelect && row.listingSelect !== listingSelect),
    ).length,
    purchased: list.filter((row) => row.plan === MATERIAL_PLAN.PAID).length,
  };
}

/**
 * @typedef {object} MaterialPurchaseState
 * @property {'paid'|'part-paid'|'estimated'} kind
 * @property {number} paidCost - What the job is charged for what was bought
 * @property {number} paidQuantity - How many of the requirement that covered
 * @property {number} remainingQuantity - How many are still to buy
 */

/**
 * Whether a row is still an estimate, or reports what was actually paid.
 *
 * A material bought in full is not a price the app should guess at — the player
 * has the receipt. One bought in part is both: what was paid, and an estimate for
 * the rest.
 *
 * @param {object} material - A JobMaterial instance; its totals are getters, so a
 *   spread of one loses them and must not be passed here
 * @returns {MaterialPurchaseState}
 */
export function materialPurchaseState(material) {
  const paidQuantity = material?.quantityPurchased ?? 0;
  const paidCost = material?.purchasedCost ?? 0;
  const required = material?.quantity ?? 0;
  const remainingQuantity = Math.max(0, required - paidQuantity);

  if (material?.purchaseComplete) {
    return { kind: "paid", paidCost, paidQuantity, remainingQuantity: 0 };
  }
  if (paidQuantity > 0) {
    return { kind: "part-paid", paidCost, paidQuantity, remainingQuantity };
  }
  return { kind: "estimated", paidCost: 0, paidQuantity: 0, remainingQuantity };
}

/**
 * How old the figures a job is priced against actually are.
 *
 * The server refreshes on a period measured in hours, so a reader planning
 * against them deserves to know whether they are minutes or most of a day old —
 * the figures look equally authoritative either way.
 *
 * The oldest of the materials is the honest answer: a total is only as fresh as
 * the stalest price inside it.
 *
 * @param {Array<{typeID: number}>} materials
 * @param {(typeID: number) => object|undefined} findMarketData
 * @returns {number|null} Milliseconds since the oldest was refreshed, or null
 *   where nothing has a timestamp
 */
export function priceAge(materials = [], findMarketData) {
  let oldest = null;

  for (const material of materials) {
    const updated = findMarketData?.(material.typeID)?.lastUpdated;
    if (!Number.isFinite(updated)) continue;
    if (oldest === null || updated < oldest) oldest = updated;
  }

  return oldest === null ? null : Date.now() - oldest;
}
