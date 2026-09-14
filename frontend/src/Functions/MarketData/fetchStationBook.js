import getMarketData from "../EveESI/World/getMarketData";
import { deriveBookPrices } from "./deriveBookPrices";

/**
 * One type's prices at a station the reader saved, fetched by the browser.
 *
 * The server prices the four hubs it walks; a station a reader adds is nobody's
 * to walk but ours, so the orders are read here and put through the same
 * derivation the server uses.
 *
 * **A region's orders cover every station in it.** ESI answers per region and
 * type, so the pages fetched for one station are the same pages another station
 * in that region needs — `ordersByRegionAndType` is what a caller pricing
 * several stations reads once and splits, rather than paying for the region per
 * station.
 */

/**
 * When the orders read for one region and type expire, as ESI says.
 *
 * `Expires` is CORS-safelisted, so the browser can read it without the endpoint
 * exposing it, and ESI's `Cache-Control` on this route carries no `max-age` —
 * this header is the only statement of when the book can have changed.
 *
 * @param {Headers} headers
 * @returns {number|undefined} Milliseconds, or undefined where none was given
 */
export function expiresAt(headers) {
  const raw = headers?.get?.("expires");
  if (!raw) return undefined;

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Every order for one type across a region, with what ESI said about them.
 *
 * Walks the pages, because a busy type runs to several and a caller reading only
 * the first would price against part of the book.
 *
 * @param {object} params
 * @param {number} params.regionID
 * @param {number|string} params.typeID
 * @param {{etag?: string, data?: Array}} [params.held] - What is already held
 *   for this region and type, so an unchanged book costs a 304 rather than a
 *   download
 * @returns {Promise<{orders: Array, etag: string, expiresAt: number|undefined,
 *   unchanged: boolean}>}
 */
export async function ordersByRegionAndType({ regionID, typeID, held }) {
  const orders = [];
  let page = 1;
  let totalPages = 1;
  let etag = "";
  let expires;
  let unchanged = false;

  while (page <= totalPages) {
    const result = await getMarketData({
      regionID,
      typeID,
      page,
      // Only the first page's etag is offered: a book that has not changed
      // answers 304 there, and the pages of a region are generated together.
      existingData: page === 1 ? (held ?? {}) : {},
      config: { group: "market", priority: "low", batchable: true },
    });

    if (page === 1) {
      etag = result.etag ?? "";
      expires = expiresAt(result.headers);
      unchanged = Boolean(result.unchanged);
      if (unchanged) {
        return {
          orders: held?.data ?? [],
          etag,
          expiresAt: expires,
          unchanged,
        };
      }
    }

    orders.push(...(result.data ?? []));
    totalPages = result.totalPages ?? 1;
    page += 1;
  }

  return { orders, etag, expiresAt: expires, unchanged };
}

/**
 * The four prices for one type at one saved station.
 *
 * @param {object} params
 * @param {number} params.regionID - The region the station sits in
 * @param {number|string} params.locationID - The station itself; the region's
 *   other stations are read and discarded
 * @param {number|string} params.typeID
 * @param {{etag?: string, data?: Array}} [params.held]
 * @returns {Promise<{prices: import("./deriveBookPrices").BookPrices,
 *   orders: Array, etag: string, expiresAt: number|undefined}>}
 */
export async function fetchStationPrices({
  regionID,
  locationID,
  typeID,
  held,
}) {
  const book = await ordersByRegionAndType({ regionID, typeID, held });

  return {
    prices: deriveBookPrices(book.orders, locationID),
    orders: book.orders,
    etag: book.etag,
    expiresAt: book.expiresAt,
  };
}
