/**
 * Keeps held prices in step with the markets they came from, for the life of the
 * page.
 *
 * Nothing here belongs to a screen. A price resolved for one panel is read by
 * the next, and by classes and reducers that never render at all, so what keeps
 * those prices current cannot be owned by a component that happens to be mounted
 * — it runs whether or not anything is looking.
 *
 * What paces it is the asking, not the staleness. A market's own clock decides
 * whether the rows held for it survive; this only decides how often to go and
 * find out.
 */

import { expireSavedSourceRows, revalidateSourceClocks } from "./priceCache.js";

/**
 * How often to ask the markets holding rows whether their books have moved.
 *
 * The server's scheduler ticks every fifteen minutes and publishes only the
 * regions ESI says can have changed, so a shorter interval cannot see anything
 * that has not been published and a longer one leaves a reader on figures the
 * server has already replaced.
 */
export const PROBE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The shortest gap between two wake probes.
 *
 * Alt-tabbing is not a reason to ask every market for a price, and a tab that is
 * hidden and shown repeatedly would otherwise ask on every pass.
 */
export const WAKE_PROBE_FLOOR_MS = 5 * 60 * 1000;

let started = false;
let timer = null;
let stopListening = null;
let lastProbedAt = 0;

/**
 * Retires what a reader-saved market has finished with, then asks every market
 * this server walks where its book has got to.
 *
 * A probe that could not be made is left alone: the rows held stay held, and the
 * next one asks again. A market not answering says nothing about whether the
 * figures held for it are still good.
 *
 * @returns {Promise<void>}
 */
async function probe() {
  lastProbedAt = Date.now();
  // The two halves fail independently, as the loader's transports do. Retiring
  // is local and asks nothing; probing reaches the network. Sharing one `try`
  // let a fault in the local half withhold the probe that keeps every hub price
  // fresh, and silently — which is not hypothetical: a missing export threw here
  // once and cancelled the probe for the whole tick with nothing reporting it.
  try {
    // A reader-saved source states its own expiry on the rows it produced, so
    // whether those are finished with is already known here. Only the markets
    // this server walks have to be asked.
    expireSavedSourceRows();
  } catch {
    // Swallowed on purpose, per the contract above.
  }

  try {
    await revalidateSourceClocks();
  } catch {
    // Swallowed on purpose, per the contract above.
  }
}

/** @returns {void} */
function probeOnWake() {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastProbedAt < WAKE_PROBE_FLOOR_MS) return;
  void probe();
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
