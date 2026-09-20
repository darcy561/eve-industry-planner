import fetchWithCustomHeaders from "../fetchWithCustomHeaders";
import { getEsiAccessToken } from "../../Auth/esiCredentials/provider.js";
import {
  MARKET_STRUCTURE_SCOPE,
  tokenHasScope,
} from "../../Auth/esiCredentials/tokenScopes.js";
import { LocationResolutionError, isRefusalStatus } from "./locationOutcome";

/**
 * A player structure's market orders, read as one character.
 *
 * Beside `getMarketData` rather than the naming code, because it is the same
 * kind of thing: the orders ESI holds for a place. What makes it different is
 * that a structure's are private — the call needs a token, and the character
 * holding it needs docking access — so the answer is either the orders or a
 * refusal, and a caller walking an account's characters needs to tell those
 * apart from a request that merely failed.
 *
 * There is no per-type form of this endpoint. A reader pricing one item pays
 * for the structure's whole order book, which is why nothing calls this per
 * want and why what it returns is kept.
 */

/**
 * The most pages one structure's orders may run to before the read is refused.
 *
 * **A partial read is a wrong answer, not a cheap one.** Prices are derived
 * from every order at the place, so a book cut short can report an ask that
 * nobody is offering and a spread that does not exist — and nothing downstream
 * could tell that from a real figure. So a structure past this is refused
 * whole.
 *
 * The number is a guard against a market far outside anything seen rather than
 * a budget: at a thousand orders a page this is thirty thousand orders in one
 * structure, where all of The Forge — every station and citadel in the busiest
 * region in the game — comes to 408 pages across the lot.
 */
export const MAX_ORDER_PAGES = 30;

/**
 * @typedef {object} StructureOrders
 * @property {false} refused
 * @property {Array<object>} orders - Orders as ESI returns them
 * @property {number} refreshedAt - When ESI last changed these orders
 * @property {number} [expiresAt] - When they can next have changed
 */

/**
 * Asks ESI for a structure's orders as one character, and says which of the two
 * answers it got.
 *
 * Every page is read here rather than by the caller: the first page is what
 * establishes that this character can see the structure at all, and the rest
 * are only meaningful read by that same character, so splitting the walk would
 * hand a caller a refusal to interpret halfway through a market.
 *
 * @param {number} structureID
 * @param {object} character
 * @param {object} [config] - Passed to the ESI fetch wrapper
 * @returns {Promise<{refused: true}|StructureOrders>}
 * @throws {LocationResolutionError} the read did not settle
 */
export async function fetchStructureOrders(
  structureID,
  character,
  config = {},
) {
  if (!structureID) {
    throw new LocationResolutionError("structure orders: no structure id");
  }
  if (!character) {
    throw new LocationResolutionError("structure orders: no character", {
      locationId: structureID,
    });
  }

  const accessToken = await accessTokenFor(structureID, character);

  const first = await readPage(structureID, accessToken, 1, config);
  if (first.refused) return { refused: true };

  const totalPages = first.totalPages;
  if (totalPages > MAX_ORDER_PAGES) {
    throw new LocationResolutionError(
      `structure orders: ${totalPages} pages exceeds the ${MAX_ORDER_PAGES} this reads`,
      { locationId: structureID, permanent: true },
    );
  }

  const rest = await Promise.all(
    pageNumbersAfterFirst(totalPages).map((page) =>
      readPage(structureID, accessToken, page, config),
    ),
  );

  // A page refused after the first is not the account being told it cannot see
  // this structure — it already has been told it can. Whatever it is, the book
  // it would have held is missing, and prices derived without it would be wrong.
  if (rest.some((page) => page.refused)) {
    throw new LocationResolutionError(
      "structure orders: a page was refused mid-read",
      { locationId: structureID },
    );
  }

  return {
    refused: false,
    orders: [first, ...rest].flatMap((page) => page.orders),
    refreshedAt: first.refreshedAt,
    ...(first.expiresAt === undefined ? {} : { expiresAt: first.expiresAt }),
  };
}

async function accessTokenFor(structureID, character) {
  let accessToken;
  try {
    ({ accessToken } = await getEsiAccessToken(character.CharacterHash));
  } catch (err) {
    throw new LocationResolutionError("structure orders: no access token", {
      locationId: structureID,
      cause: err,
    });
  }

  if (!tokenHasScope(accessToken, MARKET_STRUCTURE_SCOPE)) {
    // Asking anyway spends a 403 to be told what the token already says, and
    // ESI charges a 4xx five times what it charges a hit — and once it arrives
    // it cannot be told from a docking refusal, which is how a character that
    // only needs re-authorising comes to look like one that cannot dock.
    throw new LocationResolutionError(
      `structure orders: token lacks ${MARKET_STRUCTURE_SCOPE}`,
      {
        locationId: structureID,
        characterHash: character.CharacterHash,
        needsReauthorisation: true,
      },
    );
  }

  return accessToken;
}

/**
 * One page, and what its headers said.
 *
 * **No `If-None-Match` here, unlike a region's orders.** An etag buys a 304 for
 * a caller holding the orders it was last given; this one holds derived prices
 * and throws the orders away, so it has nothing a 304 could spare it from
 * fetching. What paces it is the expiry instead.
 */
async function readPage(structureID, accessToken, page, config) {
  let response;
  try {
    response = await fetchWithCustomHeaders(
      `https://esi.evetech.net/markets/structures/${structureID}/?datasource=tranquility&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      {
        priority: "normal",
        batchable: true,
        maxRetries: 3,
        useQueue: true,
        ...config,
      },
    );
  } catch (err) {
    throw new LocationResolutionError("structure orders: request failed", {
      locationId: structureID,
      cause: err,
    });
  }

  if (!response.ok) {
    if (isRefusalStatus(response.status)) return { refused: true };

    throw new LocationResolutionError(
      `structure orders: ${response.status} ${response.statusText}`,
      { locationId: structureID, status: response.status },
    );
  }

  return {
    refused: false,
    orders: await response.json(),
    totalPages: pageCount(response, structureID),
    refreshedAt: headerTime(response, "last-modified") ?? Date.now(),
    expiresAt: headerTime(response, "expires"),
  };
}

/**
 * How many pages the orders run to, as the response states it.
 *
 * **A header that cannot be read fails the whole read.** Taking it as one page
 * is what a missing header means and is the wrong answer for an unreadable one:
 * the market would settle as whatever the first page happened to hold, which is
 * a partial read wearing a complete one's clothes — the one outcome this module
 * exists to refuse.
 *
 * @returns {number}
 */
function pageCount(response, structureID) {
  const stated = response.headers.get("x-pages");
  if (stated === null || stated === "") return 1;

  // Decimal digits and nothing else: `Number` would take "0x10" and "1e3" as
  // counts, and a header that says either of those is not one this understands.
  const pages = /^\s*\d+\s*$/.test(stated) ? Number(stated) : NaN;
  if (!Number.isInteger(pages) || pages < 1) {
    throw new LocationResolutionError(
      `structure orders: unreadable page count "${stated}"`,
      { locationId: structureID },
    );
  }

  return pages;
}

/** @returns {number|undefined} */
function headerTime(response, name) {
  const stated = Date.parse(response.headers.get(name) ?? "");
  return Number.isFinite(stated) ? stated : undefined;
}

function pageNumbersAfterFirst(totalPages) {
  return Array.from({ length: Math.max(totalPages - 1, 0) }, (_, i) => i + 2);
}
