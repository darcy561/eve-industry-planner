/**
 * Keeps held prices in step with the markets they came from, for the life of the
 * page.
 *
 * Nothing here belongs to a screen: a price is read by panels, classes and
 * reducers alike, so what keeps prices current cannot be owned by a component
 * that happens to be mounted. What paces it is the asking — a market's own clock
 * decides what survives, and this only decides how often to go and find out.
 */

import {
  expireSavedSourceRows,
  rotateSelfReadMarkets,
  revalidateSourceClocks,
} from "./priceCache.js";

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
 * Asks every market holding rows where it has got to, reads again the markets
 * the reader reads themselves whose turn has come, and retires what is left
 * over.
 *
 * A probe that could not be made is left alone: a market not answering says
 * nothing about whether the figures held for it are still good.
 *
 * **Each part fails on its own**, because sharing one `try` once let a fault in
 * one withhold the probe that keeps every hub price fresh, silently.
 *
 * @returns {Promise<void>}
 */
async function probe() {
  lastProbedAt = Date.now();

  // Before the sweep, so a market that can be read is replaced rather than
  // emptied — and not while hidden, being the one part of a tick that spends the
  // reader's own ESI allowance.
  try {
    if (document.visibilityState !== "hidden") {
      await rotateSelfReadMarkets();
    }
  } catch {
    // Swallowed, as each part is: see the contract above.
  }

  try {
    expireSavedSourceRows();
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
 * Reads every market the reader reads themselves whose turn has come, now.
 *
 * For a reader who has just signed in: their saved markets are known at that
 * moment, and waiting for the first tick would leave the prices they saved
 * those markets for up to a quarter of an hour behind. The hour then paces it
 * from there, as it does for a market read by a surface asking.
 *
 * Nothing waits on this — a reader is not held up by a market they have not
 * looked at yet, and a market that cannot be read is put back a full turn by
 * the rotation itself.
 *
 * @returns {void}
 */
export function readSavedMarketsNow() {
  void rotateSelfReadMarkets().catch(() => {
    // The rotation reports a market it could not read by putting its turn back,
    // and a reader is told nothing here: this is a refresh nobody asked for.
  });
}

/**
 * Starts the refresh cycle.
 *
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
