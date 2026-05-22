import GLOBAL_CONFIG from "../../../global-config-app";
import { chunkArray } from "../chunkArray.js";
import withRequestRetries, {
  apiRateLimitRetryConfig,
  mergeApiRetryOptions,
  splitRetryConfig,
} from "../withRequestRetries.js";

/** Public API retry options (same 429 / `Retry-After` policy as private). */
export const publicApiRetryConfig = apiRateLimitRetryConfig;

const {
  DEFAULT_DISCORD_INVITE,
  DEFAULT_GITHUB_LINK,
  DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER,
} = GLOBAL_CONFIG;

/**
 * @typedef {object} PublicRequestBatchOptions
 * @property {number} size - Max items per HTTP request; must be >= 1.
 * @property {string} arrayKey - JSON body field to split.
 * @property {boolean} [mergeResponseJsonArrays] - Each JSON body is an array; results concatenated (strict: throws on !ok per chunk after retries).
 * @property {boolean} [mergeResponseJsonObjects] - Each JSON body is an object; merged with `Object.assign` in chunk order. **Lenient:** failed chunk responses are skipped (empty object) so partial results match legacy `fetchMarketPrices` / `fetchSystemIndexes` behavior.
 * @property {'first'|'aggregate'} [failure] - Used when neither merge flag is set; how to handle rejections in `allSettled` (default `aggregate`).
 * @property {string} [errorLabel] - For aggregate errors.
 */

/**
 * Pulls `batch` from config.
 * @param {object} [config]
 * @returns {{ inner: object, batch?: PublicRequestBatchOptions }}
 */
function stripBatchFromConfig(config) {
  if (!config || typeof config !== "object") {
    return { inner: {} };
  }
  const { batch, ...inner } = config;
  return { inner, batch };
}

/**
 * Default headers for all API requests (public headers)
 */
const defaultHeaders = {
  "X-User-Agent": `Eve Industry Planner/client/V${__APP_VERSION__} (eve: Oswold Saraki/${DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}; discordID: darcy561; discordURL: ${DEFAULT_DISCORD_INVITE}; Github: ${DEFAULT_GITHUB_LINK})`,
};

/**
 * Apply public headers (default headers) to options
 * @param {Object} options - Fetch options
 * @param {Object} config - Configuration
 * @param {string} [config.requestName] - Optional name for the request (appears in network tab headers)
 * @returns {Object} Options with public headers applied
 *
 * @example
 * const options = applyPublicHeaders({
 *   method: 'GET',
 *   headers: { 'Content-Type': 'application/json' }
 * });
 */
export function applyPublicHeaders(options = {}, config = {}) {
  const headers = {
    ...defaultHeaders,
    ...options.headers,
    ...(config.requestName && { "X-Request-Name": config.requestName }),
  };
  return {
    ...options,
    headers
  };
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isJsonLikeObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @param {PromiseSettledResult<unknown>[]} settled
 * @param {string} label
 */
function throwIfAnySettledFailed(settled, label) {
  const failed = settled.filter((s) => s.status === "rejected");
  if (failed.length === 0) return;
  const err = /** @type {PromiseRejectedResult} */ (failed[0]).reason;
  const msg = err instanceof Error ? err.message : String(err);
  throw new Error(
    `${label}: ${failed.length}/${settled.length} batch(es) failed — ${msg}`
  );
}

async function executePublicFetchSingle(URL, options = {}, config = {}) {
  const { rest: headerConfig, retry } = splitRetryConfig(config);

  const runOnce = async () => {
    const enhancedOptions = applyPublicHeaders(options, headerConfig);
    return fetch(URL, enhancedOptions);
  };

  const retryOpts = mergeApiRetryOptions(retry);
  if (retryOpts === false) {
    return runOnce();
  }

  return withRequestRetries(runOnce, retryOpts);
}

/**
 * @param {string} URL
 * @param {Object} options
 * @param {object} innerConfig
 * @param {PublicRequestBatchOptions} batch
 */
async function executeBatchedPublicRequest(URL, options, innerConfig, batch) {
  const {
    size,
    arrayKey,
    mergeResponseJsonArrays = false,
    mergeResponseJsonObjects = false,
    failure = "aggregate",
    errorLabel = "Batched public request",
  } = batch;

  if (mergeResponseJsonArrays && mergeResponseJsonObjects) {
    throw new Error(
      "fetchWithPublicHeaders batch: use only one of mergeResponseJsonArrays or mergeResponseJsonObjects"
    );
  }

  if (typeof options.body !== "string") {
    throw new Error("Batched public request requires options.body as a JSON string");
  }

  let bodyObj;
  try {
    bodyObj = JSON.parse(options.body);
  } catch {
    throw new Error("Batched public request body must be valid JSON");
  }

  if (!bodyObj || typeof bodyObj !== "object" || !Array.isArray(bodyObj[arrayKey])) {
    throw new Error(
      `Batched public request body must contain an array property "${arrayKey}"`
    );
  }

  const items = bodyObj[arrayKey];
  const chunks = chunkArray(items, size);

  if (chunks.length === 0) {
    if (mergeResponseJsonArrays) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (mergeResponseJsonObjects) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 204 });
  }

  const methodLabel = options.method || "GET";

  if (mergeResponseJsonObjects) {
    const partialObjects = await Promise.all(
      chunks.map(async (chunk) => {
        const nextBody = { ...bodyObj, [arrayKey]: chunk };
        const res = await executePublicFetchSingle(
          URL,
          { ...options, body: JSON.stringify(nextBody) },
          innerConfig
        );
        if (!res.ok) return {};
        const data = await res.json().catch(() => ({}));
        if (isJsonLikeObject(data)) {
          return /** @type {Record<string, unknown>} */ (data);
        }
        return {};
      })
    );
    const merged = {};
    for (const obj of partialObjects) {
      Object.assign(merged, obj);
    }
    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const nextBody = { ...bodyObj, [arrayKey]: chunk };
      const res = await executePublicFetchSingle(
        URL,
        { ...options, body: JSON.stringify(nextBody) },
        innerConfig
      );

      if (mergeResponseJsonArrays) {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `${methodLabel} ${URL} failed: ${res.status} ${text || res.statusText}`
          );
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `${methodLabel} ${URL} failed: ${res.status} ${text || res.statusText}`
        );
      }
      return res;
    })
  );

  if (failure === "first") {
    for (const result of settled) {
      if (result.status === "rejected") {
        throw result.reason;
      }
    }
  } else {
    throwIfAnySettledFailed(settled, errorLabel);
  }

  if (mergeResponseJsonArrays) {
    const merged = [];
    for (const r of settled) {
      if (r.status === "fulfilled") {
        merged.push(...r.value);
      }
    }
    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const last = settled[settled.length - 1];
  return /** @type {PromiseFulfilledResult<Response>} */ (last).value;
}

/**
 * Enhanced fetch with only public headers (no authentication).
 *
 * **Retries** (408 / 429 / 5xx by default) unless `config.retry === false`.
 *
 * Optional **`config.batch`**: `{ size, arrayKey, mergeResponseJsonArrays?, mergeResponseJsonObjects?, … }`.
 * Omit `batch` or use `size` &lt; 1 for a single request. Map-merge endpoints (`market-prices`, `system-indexes`)
 * use **`mergeResponseJsonObjects`** (lenient partial merge). See typedef {@link PublicRequestBatchOptions}.
 *
 * @param {string} URL - Request URL
 * @param {Object} options - Request options
 * @param {Object} [config]
 * @param {string} [config.requestName]
 * @param {false|true|object} [config.retry]
 * @param {PublicRequestBatchOptions} [config.batch]
 * @returns {Promise<Response>}
 *
 * @example
 * const response = await fetchWithPublicHeaders('/api/v1/systemindexes', {
 *   method: 'GET'
 * }, { requestName: 'fetchSystemIndexes' });
 */
export async function fetchWithPublicHeaders(URL, options = {}, config = {}) {
  const { inner: innerConfig, batch } = stripBatchFromConfig(config);

  const useBatch =
    batch &&
    typeof batch.size === "number" &&
    batch.size >= 1 &&
    typeof batch.arrayKey === "string" &&
    batch.arrayKey.length > 0;

  if (batch && !useBatch) {
    throw new Error(
      "fetchWithPublicHeaders: config.batch needs size >= 1 and a non-empty arrayKey (or omit batch for a single request)"
    );
  }

  if (useBatch) {
    return executeBatchedPublicRequest(URL, options, innerConfig, batch);
  }

  return executePublicFetchSingle(URL, options, innerConfig);
}
