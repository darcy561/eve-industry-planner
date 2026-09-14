import { fetchWithPublicHeaders } from "./applyPublicHeaders.js";
import { MAX_BATCH_SYSTEM_OR_TYPE_IDS } from "./apiLimits.js";
import { chunkArray } from "../chunkArray.js";

/**
 * @typedef {object} MarketPricesQueryResult
 * @property {Object<string, {refreshedAt: number, prices: Object}>} sources
 * @property {{refreshedAt: number, prices: Object}|null} adjusted
 */

/**
 * Prices for the markets and types a caller names.
 *
 * The caller says which markets it is pricing against, so the response carries
 * those and nothing else — where the shape this replaces returned every hub for
 * every type and left the caller to pick one.
 *
 * Handler: `MarketPricesQueryHandler`
 * (`services/api/v1endpoints/marketPricesQuery.go`).
 *
 * @param {object} params
 * @param {Iterable<{typeID: string|number, sourceID: string}>} params.wants -
 *   Each type paired with the one market it is wanted at. Pairs rather than two
 *   lists: a caller pricing some materials at Jita and some at Amarr wants
 *   neither of them at both
 * @param {Iterable<string|number>} [params.adjustedTypeIDs] - Types whose
 *   adjusted price is also wanted. Their own list with their own block and
 *   clock, because they belong to no market and refresh daily
 * @returns {Promise<MarketPricesQueryResult>} Empty where there was nothing to
 *   ask about
 * @throws where the request could not be answered. A refusal must not settle: a
 *   market that answered and held no order for a type, and a market that could
 *   not be reached, are different facts, and caching the second as the first
 *   tells a reader there is no price until the entry goes stale
 */
export async function fetchMarketPricesQuery({ wants, adjustedTypeIDs = [] }) {
  const reads = [];
  const seen = new Set();

  for (const { typeID, sourceID } of wants ?? []) {
    if (typeID == null || !sourceID) continue;
    const key = `${sourceID}|${String(typeID)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reads.push({ sourceID, typeID: String(typeID) });
  }

  for (const typeID of new Set(Array.from(adjustedTypeIDs ?? [], String))) {
    reads.push({ typeID });
  }

  if (reads.length === 0) return emptyResult();

  // Chunked here rather than through the shared batch helper: that merges
  // responses with one Object.assign, and this response nests its rows under
  // each source — so a second chunk would replace the first source block whole
  // and take every price in it.
  //
  // Split on the reads themselves rather than on type ids, because the cap the
  // server enforces counts the same: one type at two markets is two reads.
  const answers = await Promise.all(
    chunkArray(reads, MAX_BATCH_SYSTEM_OR_TYPE_IDS).map((chunk) =>
      askFor(bodyFor(chunk)),
    ),
  );

  return answers.reduce(mergeInto, emptyResult());
}

/** One chunk's reads, grouped back into the shape the handler takes. */
function bodyFor(reads) {
  const sources = {};
  const adjustedTypeIDs = [];

  for (const { sourceID, typeID } of reads) {
    if (sourceID === undefined) {
      adjustedTypeIDs.push(typeID);
      continue;
    }
    (sources[sourceID] ??= []).push(typeID);
  }

  return { sources, adjustedTypeIDs };
}

function emptyResult() {
  return { sources: {}, adjusted: null };
}

async function askFor({ sources, adjustedTypeIDs }) {
  const response = await fetchWithPublicHeaders(
    "/api/v1/market-prices/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources, adjustedTypeIDs }),
    },
    { requestName: "fetchMarketPricesQuery" },
  );

  if (!response.ok) {
    throw new Error(
      `market prices query failed: ${response.status ?? "no status"}`,
    );
  }

  const body = await response.json();
  return { sources: body?.sources ?? {}, adjusted: body?.adjusted ?? null };
}

/**
 * Folds one chunk's answer into the running result, merging rows per source
 * rather than replacing a source's block.
 *
 * The clock is the source's own and is the same in every chunk, so the later one
 * simply wins.
 */
function mergeInto(merged, answer) {
  for (const [sourceID, block] of Object.entries(answer.sources)) {
    const held = merged.sources[sourceID];
    merged.sources[sourceID] = {
      refreshedAt: block.refreshedAt ?? held?.refreshedAt ?? 0,
      prices: { ...held?.prices, ...block.prices },
    };
  }

  if (answer.adjusted) {
    merged.adjusted = {
      refreshedAt:
        answer.adjusted.refreshedAt ?? merged.adjusted?.refreshedAt ?? 0,
      prices: { ...merged.adjusted?.prices, ...answer.adjusted.prices },
    };
  }

  return merged;
}

export default fetchMarketPricesQuery;
