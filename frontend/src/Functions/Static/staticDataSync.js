/**
 * Keeps the static data files current for the life of the page.
 *
 * The files change when a new SDE build is published and at no other time, so
 * nothing here runs on a timer: the page checks once on load, and after that the
 * server says when there is something to do. A session open when a build ships
 * hears about it over the websocket; one that was asleep finds out when it wakes.
 */

import { queryClient } from "../../queryClient.js";
import { refreshStaticDataCache } from "../Helper/getCachedData.js";
import {
  primeMarketGroupData,
  resetMarketGroupData,
} from "../MarketData/marketGroupData.js";
import { resetReprocessing } from "./reprocessing.js";
import { resetRecipes } from "./recipes.js";

/**
 * How far apart clients spread their download once a build is announced.
 *
 * Every connected client is told at the same instant, so without this they would
 * all ask for the same files at the same moment. The wait costs nothing: the
 * build a client holds stays readable and correct until the new one has arrived.
 */
const ANNOUNCEMENT_SPREAD_MS = 30 * 1000;

/**
 * The shortest gap between two wake checks.
 *
 * Alt-tabbing is not a reason to ask the server anything, and a tab that is
 * hidden and shown repeatedly would otherwise check on every pass.
 */
const WAKE_CHECK_FLOOR_MS = 5 * 60 * 1000;

let started = false;
let stopListening = null;
let spreadTimer = null;
let inFlight = null;
let lastCheckedAt = 0;

/** @returns {number} a wait somewhere in the spread window */
function spreadDelay() {
  return Math.floor(Math.random() * ANNOUNCEMENT_SPREAD_MS);
}

/**
 * Reads the files again and drops everything held against the build they
 * replaced. Concurrent callers share one pass.
 *
 * @param {boolean} [force] - refresh even when the build has not moved
 * @returns {Promise<void>}
 */
export function refreshStaticData(force = false) {
  inFlight ??= (async () => {
    try {
      const { changed } = await refreshStaticDataCache(force);

      // A new SDE build is a different file behind every key, and everything holding the old
      // one has to let go of it: the query entries a view is subscribed to, and the copies
      // primed for the callers that read without awaiting. An unchanged build is nothing to
      // drop — the copies held are already that build's.
      if (changed) {
        // resetMarketGroupData drops the item half too, so the tree and the records it reads
        // groups from are never left from different builds.
        resetMarketGroupData();
        resetReprocessing();
        resetRecipes();
        queryClient.invalidateQueries({ queryKey: ["static"] });
      }

      // Material pricing walks the market group tree while building a row, so
      // it needs these readable without awaiting.
      await primeMarketGroupData();

      // Only a pass that got an answer counts as having checked. Stamping a
      // failed one would let the wake floor below suppress the retry that a tab
      // coming back from a bad network window is exactly there to make.
      lastCheckedAt = Date.now();
    } catch (err) {
      console.error("[staticDataSync] refresh failed:", err);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Refreshes after a random wait, so an announcement every client heard at once
 * does not become every client fetching at once.
 *
 * @returns {void}
 */
export function refreshStaticDataAfterAnnouncement() {
  if (spreadTimer != null) return;
  spreadTimer = setTimeout(() => {
    spreadTimer = null;
    void refreshStaticData();
  }, spreadDelay());
}

/**
 * Checks on waking, unless the last check was recent enough that nothing can
 * have been missed by waiting for the next one.
 *
 * @returns {void}
 */
function checkOnWake() {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastCheckedAt < WAKE_CHECK_FLOOR_MS) return;
  void refreshStaticData();
}

/**
 * Primes the files and starts listening for the reasons to read them again.
 *
 * Called explicitly rather than on import, so a test or a tool can load this
 * module without acquiring a network fetch and two listeners.
 *
 * @returns {Promise<void>} the first load, so a caller can await having the files
 */
export function startStaticDataSync() {
  if (started) return inFlight ?? Promise.resolve();
  started = true;

  // A tab asleep when a build shipped was not listening, and the socket that
  // would have told it is the one that was throttled. Waking is the only chance
  // it gets to notice, so it asks — subject to the floor above.
  document.addEventListener("visibilitychange", checkOnWake);
  // Offline covers the same gap: nothing could have reached the tab while the
  // network was gone.
  window.addEventListener("online", checkOnWake);
  stopListening = () => {
    document.removeEventListener("visibilitychange", checkOnWake);
    window.removeEventListener("online", checkOnWake);
  };

  return refreshStaticData();
}

/**
 * Stops listening and forgets what was checked. Tests only — the app starts this
 * once and never stops it.
 *
 * @returns {void}
 */
export function stopStaticDataSync() {
  stopListening?.();
  stopListening = null;
  if (spreadTimer != null) {
    clearTimeout(spreadTimer);
    spreadTimer = null;
  }
  started = false;
  inFlight = null;
  lastCheckedAt = 0;
}
