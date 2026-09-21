/**
 * Keeps held prices in step with the markets they came from, for the life of the
 * page.
 *
 * Nothing here belongs to a screen: a price is read by panels, classes and
 * reducers alike, so what keeps prices current cannot be owned by a component
 * that happens to be mounted.
 */

import { rotateSelfReadMarkets, revalidateSourceClocks } from "./priceCache.js";
import { dropUnreadMarkets } from "./priceStore.js";

/**
 * How often to ask the markets holding rows where they have got to. The server
 * publishes on the same fifteen minutes, so a shorter interval sees nothing new
 * and a longer one leaves a reader on figures already replaced.
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
  } catch {
    /* empty */
  }

  // After the rotation, so a market whose turn has just come is refreshed
  // rather than thrown away and read again from nothing.
  try {
    await dropUnreadMarkets();
  } catch {
    /* empty */
  }

  try {
    await revalidateSourceClocks();
  } catch {
    /* empty */
  }
}

/** @returns {void} */
function probeOnWake() {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastProbedAt < WAKE_PROBE_FLOOR_MS) return;
  void probe();
}

/**
 * A probe at sign-in, which is both when a reader's saved markets are first
 * known and when a machine that has been away comes back. Waiting for the first
 * tick would leave them a quarter of an hour behind, and a week's absence would
 * open on the prices they left.
 *
 * Nothing waits on it: a reader is not held up by a market they have not looked
 * at yet.
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

  // A backgrounded tab's timers are throttled, so a reader coming back would
  // otherwise sit on whatever the clock said when the interval last fired.
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
