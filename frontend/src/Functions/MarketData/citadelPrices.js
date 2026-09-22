import useUsersStore from "../../Zustand/usersStore";
import { askEachCharacter, askOrder } from "../EveESI/World/askEachCharacter";
import { fetchStructureOrders } from "../EveESI/World/getStructureOrders";
import { LocationResolutionError } from "../EveESI/World/locationOutcome";
import { pricesByType } from "./pricesFromOrders";
import { readMarketCharacter, writeMarketCharacter } from "./priceStore";

/**
 * Every price at one saved citadel, read on the account's own characters.
 *
 * One read answers every type, because ESI has no per-type form of a structure's
 * market — the same price whether one type is wanted or four hundred, which is
 * what makes a citadel worth keeping on the reader's device.
 */

/**
 * How long a market's prices stand before it is read again.
 *
 * **Not the expiry ESI states**, which is minutes: honouring that would walk a
 * whole market a dozen times an hour on the reader's own token. An hour is what
 * this server refreshes the markets it prices at, so both are the same age.
 *
 * @type {number}
 */
export const PRICE_ROTATION_MS = 60 * 60 * 1000;

/**
 * @typedef {object} CitadelPrices
 * @property {Map<string, import("./pricesFromOrders").DerivedPrices>} rows -
 *   Prices by type id
 * @property {number} refreshedAt
 * @property {number} [expiresAt]
 */

/**
 * Reads a saved citadel's market and derives a price for every type on it.
 *
 * @param {import("./marketSources").MarketSource} source
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

  // Not an empty market: the account cannot see this one, and settling it as
  // "no orders here" would price every type at nothing.
  if (walk.refused) {
    throw new LocationResolutionError(
      `citadel market: no character can see ${source.structureID}`,
      { locationId: source.structureID, permanent: true },
    );
  }

  rememberWhoRead(source, recorded, walk.character);

  return {
    rows: pricesByType(walk.answer.orders, source.structureID),
    refreshedAt: walk.answer.refreshedAt,
    // From when it was read, not from the moment the orders carried: a market
    // last traded in an hour ago would otherwise be due again the moment it
    // arrived.
    expiresAt: Date.now() + PRICE_ROTATION_MS,
  };
}

/**
 * Keeps the character that answered, so the next read asks it first. On the
 * device rather than the account: it records what worked here, and is worth
 * exactly one avoided walk. Nothing waits on the write.
 */
function rememberWhoRead(source, recorded, character) {
  const hash = character?.CharacterHash;
  if (!hash || hash === recorded) return;

  void writeMarketCharacter(source.id, hash);
}
