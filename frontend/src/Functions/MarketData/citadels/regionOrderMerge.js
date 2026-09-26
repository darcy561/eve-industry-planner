import { asStringID, asStringIDSet } from "../../Helper/ids";

/**
 * The region's orders plus the ones only the reader can see, deduplicated by
 * place so that every order in the view is as of one moment.
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
 * The systems the resolved places sit in, for the structure orders that carry no
 * `system_id`, gathered with whatever was found before.
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
 * Orders with the system of their place filled in, where one was missing, the
 * grid drawing its System column from it.
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
