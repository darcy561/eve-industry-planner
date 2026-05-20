import { getESIRateLimitStatuses } from "./fetchWithCustomHeaders.js";
import fetchWithCustomHeaders from "./fetchWithCustomHeaders.js";

/**
 * @typedef {{ online: true; playerCount: number } | { online: false; playerCount: number }} TranquilityStatusResult
 */

/**
 * @param {number} delayMs
 */
export function createTranquilityRateLimitError(delayMs) {
  const err = new Error("TRANQUILITY_RATE_LIMIT");
  err.delayMs = delayMs;
  return err;
}

function computeStatusGroupWaitMs(statusStatus) {
  const tokensPerMs = statusStatus.maxTokens / statusStatus.windowSize;
  const tokensToRecover = statusStatus.maxTokens - statusStatus.availableTokens;
  return Math.ceil(tokensToRecover / tokensPerMs);
}

/**
 * ESI `/status/` probe for Tranquility (pure data — no store writes).
 * Throws {@link createTranquilityRateLimitError} when the status group must wait for tokens.
 *
 * @returns {Promise<TranquilityStatusResult>}
 */
export async function fetchTranquilityStatus() {
  const rateLimits = getESIRateLimitStatuses();
  const statusStatus = rateLimits.find((status) => status.group === "status");

  if (statusStatus && statusStatus.availableTokens <= 0) {
    throw createTranquilityRateLimitError(computeStatusGroupWaitMs(statusStatus));
  }

  try {
    const statusPromise = await fetchWithCustomHeaders(
      "https://esi.evetech.net/status/?datasource=tranquility",
      {},
      {
        group: "status",
        priority: "low",
        batchable: true,
        maxRetries: 1,
      }
    );

    const statusJSON = await statusPromise.json();

    if (statusPromise.status === 200 || statusPromise.status === 304) {
      return {
        online: true,
        playerCount: Number(statusJSON.players) || 0,
      };
    }

    return { online: false, playerCount: 0 };
  } catch (err) {
    if (err.message && err.message.includes("rate limited")) {
      const rl = getESIRateLimitStatuses();
      const ss = rl.find((status) => status.group === "status");
      if (ss) {
        throw createTranquilityRateLimitError(computeStatusGroupWaitMs(ss));
      }
    }

    return { online: false, playerCount: 0 };
  }
}
