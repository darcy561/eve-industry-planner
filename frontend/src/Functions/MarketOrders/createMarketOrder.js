/**
 * Creates an ESI market order object from raw order data.
 * Transforms the raw order data into a standardized format with additional metadata.
 * 
 * @param {Object} order - Raw market order data from ESI API
 * @param {number} order.duration - Order duration in days
 * @param {boolean} order.is_corporation - Whether this is a corporation order
 * @param {string} order.issued - Order issue timestamp
 * @param {number} order.location_id - Location ID where order is placed
 * @param {number} order.order_id - Unique order ID
 * @param {number} order.price - Order price per unit
 * @param {number} order.range - Order range
 * @param {number} order.region_id - Region ID where order is placed
 * @param {number} order.type_id - Item type ID
 * @param {number} order.volume_remain - Remaining volume
 * @param {number} order.volume_total - Total volume
 * @param {string} order.CharacterHash - Character hash for identification
 * @param {boolean} [order.complete=false] - Whether order is complete
 * @param {string} [order.state="active"] - Order state
 * @returns {Object} Standardized market order object
 * 
 * @example
 * const rawOrder = { order_id: 123, type_id: 34, price: 100, ... };
 * const esiOrder = createESIMarketOrder(rawOrder);
 * console.log(esiOrder.order_id); // 123
 */
export default function createESIMarketOrder(order) {
  const isCorporation = Boolean(order.is_corporation);
  const corporationID = Number(order.corporation_id) || undefined;
  const characterID =
    Number(order.character_id || order.characterID || order.issuer_id) ||
    undefined;

  return {
    duration: order.duration,
    is_corporation: isCorporation,
    issued: order.issued,
    location_id: order.location_id,
    order_id: order.order_id,
    item_price: order.price,
    range: order.range,
    region_id: order.region_id,
    type_id: order.type_id,
    volume_remain: order.volume_remain,
    volume_total: order.volume_total,
    timeStamps: [order.issued],
    CharacterHash: order.CharacterHash,
    corporation_id: isCorporation ? corporationID : undefined,
    character_id: isCorporation ? characterID : undefined,
    complete: order.complete || false,
    state: order.state || "active",
  };
}
