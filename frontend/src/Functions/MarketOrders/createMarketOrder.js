/**
 * Creates an ESI market order object from raw order data.
 * Transforms the raw order data into a standardised format with additional metadata.
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
 * @param {number} [order.corporation_id] - Corporation the order belongs to, when it is a corporation order
 * @param {number} [order.character_id] - Character the order was fetched for
 * @param {number} order.type_id - Item type ID
 * @param {number} order.volume_remain - Remaining volume
 * @param {number} order.volume_total - Total volume
 * @param {string} order.CharacterHash - Character hash for identification
 * @param {boolean} [order.complete=false] - Whether order is complete
 * @param {string} [order.state="active"] - Order state
 * @returns {Object} Standardised market order object
 */
export default function createESIMarketOrder(order) {
  return {
    duration: order.duration,
    is_corporation: order.is_corporation,
    corporation_id: order.corporation_id ?? null,
    character_id: order.character_id ?? null,
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
    complete: order.complete || false,
    state: order.state || "active",
  };
}
