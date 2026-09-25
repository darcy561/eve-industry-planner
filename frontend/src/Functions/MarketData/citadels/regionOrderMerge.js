import { asStringID, asStringIDSet } from "../../Helper/ids";

/**
 * A region's orders and the private markets inside it, shown as one market.
 *
 * ESI answers a region with every order at every place it publishes, player
 * structures included — so the region response is not missing structures, only
 * the ones whose owners have not made them public. Those are read in the browser
 * on the reader's own token and kept, and this is where the two meet.
 */

/**
 * The region's orders, plus the ones only the reader can see.
 *
 * **Deduplicated by place, not by order.** A citadel the reader saved may also
 * be one ESI publishes, in which case the region already answered for it and
 * both sides hold the same market. Taking the region's copy keeps every order
 * in the view as of one moment: the privately-read copy was walked on its own
 * schedule, and merging the two would show one market at two moments.
 *
 * @param {Array<object>} regionOrders - As ESI returned them for the region
 * @param {Array<object>} citadelOrders - As the rotation stored them
 * @returns {Array<object>}
 */
export function mergeCitadelOrders(regionOrders, citadelOrders) {
  if (!citadelOrders?.length) return regionOrders ?? [];

  const answeredFor = asStringIDSet(
    (regionOrders ?? []).map((order) => order.location_id),
  );

  return [
    ...(regionOrders ?? []),
    ...citadelOrders.filter(
      (order) => !answeredFor.has(asStringID(order.location_id)),
    ),
  ];
}

/**
 * The systems the resolved places sit in, for the orders that did not say.
 *
 * A structure's orders carry no `system_id` — the region endpoint's do, and a
 * structure's do not — so the system a privately-read order sits in is known
 * only once its place has been named: `/universe/structures/` answers with the
 * structure's `solar_system_id`, and the name cache keeps the whole answer.
 *
 * Returned for a caller to resolve in turn, because a system id is not a system
 * name and the column shows the name.
 *
 * Gathered with whatever was found before, because a system stops being named
 * the moment its orders leave the merge — a reader changing type, or one
 * citadel's orders dropping out while another's remain — and a list that shrank
 * would stop asking about a place that is still on screen.
 *
 * @param {Array<object>} orders
 * @param {Object<string, {solar_system_id?: number}>} worldData - Places as the
 *   name cache has resolved them so far
 * @param {Iterable<number>} [found] - Systems named on an earlier round
 * @returns {number[]} Sorted, so a caller's list settles rather than arriving in
 *   whatever order the orders happened to be in
 */
export function systemsOfPlaces(orders, worldData, found = []) {
  const systems = new Set(found);

  for (const order of orders ?? []) {
    if (order.system_id) continue;

    const system = worldData?.[order.location_id]?.solar_system_id;
    if (system) systems.add(Number(system));
  }

  return [...systems].sort((a, b) => a - b);
}

/**
 * Orders with the system of their place filled in, where one was missing.
 *
 * The grid draws its System column from `system_id`, and an order that does not
 * carry one would read as an unknown system rather than as the system its
 * structure plainly sits in.
 *
 * @param {Array<object>} orders
 * @param {Object<string, {solar_system_id?: number}>} worldData
 * @returns {Array<object>} The same array where nothing was filled in, so a
 *   caller memoising on it is not handed a new one every render
 */
export function placeOrdersInSystems(orders, worldData) {
  const fillable = (orders ?? []).some(
    (order) =>
      !order.system_id && worldData?.[order.location_id]?.solar_system_id,
  );
  if (!fillable) return orders ?? [];

  return orders.map((order) => {
    if (order.system_id) return order;

    const system = worldData[order.location_id]?.solar_system_id;
    return system ? { ...order, system_id: Number(system) } : order;
  });
}
