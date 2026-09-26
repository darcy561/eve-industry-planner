import {
  rotateSelfReadMarkets,
  revalidateMarketRefreshTimes,
} from "./priceCache.js";
import { dropUnreadMarkets } from "./priceStore.js";

/**
 * How often a tick comes round: not the server's publishing cadence, but how
 * promptly a market whose own turn has come is noticed.
 *
 * @type {number}
 */
export const PROBE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The shortest gap between two wake probes — alt-tabbing is not a reason to ask
 * every market for a price.
 *
 * @type {number}
 */
export const WAKE_PROBE_FLOOR_MS = 5 * 60 * 1000;

let started = false;
let timer = null;
let stopListening = null;
let lastProbedAt = 0;

/**
 * **Each part fails on its own**, because sharing one `try` once let a fault in
 * one withhold the probe that keeps every hub price fresh, silently.
 *
 * @returns {Promise<void>}
 */
async function probe() {
  lastProbedAt = Date.now();

  try {
    await rotateSelfReadMarkets();
  } catch {}

  try {
    await dropUnreadMarkets();
  } catch {}

  try {
    await revalidateMarketRefreshTimes();
  } catch {}
}

/** @returns {void} */
function probeOnWake() {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastProbedAt < WAKE_PROBE_FLOOR_MS) return;
  void probe();
}

/**
 * A probe at sign-in, when a reader's saved markets are first known and when a
 * machine that has been away comes back. Nothing waits on it.
 *
 * @returns {void}
 */
export function readSavedMarketsNow() {
  void probe();
}

/**
 * Called explicitly rather than on import, so a test or a tool can load this
 * module without acquiring a timer and a listener.
 *
 * @returns {void}
 */
export function startPriceRefresh() {
  if (started) return;
  started = true;

  timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);

  document.addEventListener("visibilitychange", probeOnWake);
  stopListening = () => {
    document.removeEventListener("visibilitychange", probeOnWake);
  };
}

/**
 * Stops the cycle and forgets when it last asked. Tests only — the app starts
 * this once and never stops it.
 *
 * @returns {void}
 */
export function stopPriceRefresh() {
  stopListening?.();
  stopListening = null;
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
  lastProbedAt = 0;
}
