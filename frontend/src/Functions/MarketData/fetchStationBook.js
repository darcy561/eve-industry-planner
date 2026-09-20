import getMarketData from "../EveESI/World/getMarketData";
import { deriveBookPrices, pricesFromSides } from "./deriveBookPrices";

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
 * Every price at every named station in one region, from one walk of its book.
 *
 * A region's orders cover every station in it, so a reader with two saved
 * markets in the same region pays for one walk rather than two. This is the
 * whole reason the sweep groups by region rather than by market.
 *
 * **Orders are derived page by page and discarded.** A busy region runs to
 * dozens of pages at a thousand orders each, and holding the book to derive it
 * at the end would cost a reader tens of megabytes for an answer that is a few
 * hundred numbers. What accumulates is the per-station, per-type prices.
 *
 * A type absent from the answer is absent from the market, which is what lets a
 * caller replace a station's rows rather than merge into them.
 *
 * @param {object} params
 * @param {number} params.regionID
 * @param {Array<number|string>} params.stationIDs - The saved markets in it
 * @param {{etag?: string}} [params.held] - What the last walk was identified by,
 *   so an unchanged book costs one 304 rather than every page
 * @returns {Promise<{byStation: Map<string, Map<string, object>>, etag: string,
 *   expiresAt: number|undefined, unchanged: boolean}>}
 */
export async function pricesByStationInRegion({ regionID, stationIDs, held }) {
  const byStation = new Map(
    stationIDs.map((stationID) => [String(stationID), new Map()]),
  );
  const orderCounts = new Map(
    stationIDs.map((stationID) => [String(stationID), new Map()]),
  );

  let page = 1;
  let totalPages = 1;
  let etag = "";
  let expires;
  let unchanged = false;

  while (page <= totalPages) {
    const result = await getMarketData({
      regionID,
      page,
      existingData: page === 1 ? (held ?? {}) : {},
      config: { group: "market", priority: "low", batchable: true },
    });

    if (page === 1) {
      etag = result.etag ?? "";
      expires = expiresAt(result.headers);
      unchanged = Boolean(result.unchanged);
      if (unchanged) {
        return { byStation, etag, expiresAt: expires, unchanged };
      }
    }

    collectPage(result.data ?? [], orderCounts);
    totalPages = result.totalPages ?? 1;
    page += 1;
  }

  for (const [stationID, types] of orderCounts) {
    const prices = byStation.get(stationID);
    for (const [typeID, sides] of types) {
      prices.set(typeID, pricesFromSides(sides.buy, sides.sell));
    }
  }

  return { byStation, etag, expiresAt: expires, unchanged };
}

/**
 * Files one page's orders under the station and type they belong to.
 *
 * Prices rather than orders, because the orders themselves are not wanted once
 * the page is read and a region's worth of them is what this exists to avoid
 * holding.
 */
function collectPage(orders, orderCounts) {
  for (const order of orders) {
    const stationID = String(order?.location_id);
    const types = orderCounts.get(stationID);
    if (!types) continue;

    const price = order?.price;
    if (!Number.isFinite(price)) continue;

    const typeID = String(order.type_id);
    let sides = types.get(typeID);
    if (!sides) {
      sides = { buy: [], sell: [] };
      types.set(typeID, sides);
    }
    if (order.is_buy_order) sides.buy.push(price);
    else sides.sell.push(price);
  }
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
