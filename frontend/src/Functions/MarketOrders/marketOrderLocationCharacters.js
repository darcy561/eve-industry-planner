/**
 * Each market order's location paired with the character that listed it.
 *
 * An order is placed by a character standing at the market, so that character can see the place —
 * which is what spares a player structure's name lookup a refusal from everybody else on the
 * account. Both the orders ESI reports and the ones a job has stored carry the same two fields, so
 * one function answers for either.
 *
 * @param {Array<Object>} [orders]
 * @returns {Array<[number|null, string|null]>} for {@link import("../../Hooks/EveEsi/useLocationNames").charactersByLocation}
 */
export default function marketOrderLocationCharacters(orders = []) {
  return orders.map((order) => [
    order.location_id,
    order.CharacterHash ?? null,
  ]);
}
