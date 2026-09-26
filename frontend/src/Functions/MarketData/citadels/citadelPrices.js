import useUsersStore from "../../../Zustand/usersStore";
import {
  askEachCharacter,
  askOrder,
} from "../../EveESI/World/askEachCharacter";
import { fetchStructureOrders } from "../../EveESI/World/getStructureOrders";
import { LocationResolutionError } from "../../EveESI/World/locationOutcome";
import { pricesByType } from "../prices/pricesFromOrders.js";
import {
  readMarketCharacter,
  writeMarketCharacter,
} from "../prices/priceStore.js";

/**
 * How long a market's prices stand before it is read again, rather than the
 * expiry ESI states, which is minutes.
 *
 * @type {number}
 */
export const PRICE_ROTATION_MS = 60 * 60 * 1000;

/**
 * @typedef {object} CitadelPrices
 * @property {Map<string, import("../prices/pricesFromOrders.js").DerivedPrices>} typePrices -
 *   Prices by type id
 * @property {Array<object>} orders - The orders as ESI returned them, this
 *   being the only copy anything gets without walking the market again
 * @property {number} refreshedAt
 * @property {number} [expiresAt]
 */

/**
 * Reads a saved citadel's market and derives a price for every type on it.
 *
 * @param {import("../registry/marketSources.js").MarketSource} source
 * @returns {Promise<CitadelPrices>}
 * @throws {LocationResolutionError} the account was refused, or nothing settled
 */
export async function readCitadelPrices(source) {
  const recorded = await readMarketCharacter(source.id);

  const walk = await askEachCharacter(
    askOrder(
      useUsersStore.getState().account?.characters ?? [],
      recorded ? [recorded] : [],
    ),
    (character) => fetchStructureOrders(source.structureID, character),
    {
      locationID: source.structureID,
      reads: "market prices in player structures",
    },
  );

  if (walk.refused) {
    throw new LocationResolutionError(
      `citadel market: no character can see ${source.structureID}`,
      { locationId: source.structureID, permanent: true },
    );
  }

  rememberWhoRead(source, recorded, walk.character);

  return {
    typePrices: pricesByType(walk.answer.orders, source.structureID),
    orders: walk.answer.orders,
    refreshedAt: walk.answer.refreshedAt,
    expiresAt: Date.now() + PRICE_ROTATION_MS,
  };
}

/**
 * Keeps the character that answered on the device, so the next read asks it
 * first. Nothing waits on the write.
 */
function rememberWhoRead(source, recorded, character) {
  const hash = character?.CharacterHash;
  if (!hash || hash === recorded) return;

  void writeMarketCharacter(source.id, hash);
}
