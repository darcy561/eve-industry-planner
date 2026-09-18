import useUsersStore from "../../../Zustand/usersStore";
import { getESIRateLimitStatus } from "../fetchWithCustomHeaders";
import { COLLECTIONS, PHASE, PREFETCHED_PHASES, SCOPE } from "./collections";
import { CORPORATION_WALLET_DIVISIONS } from "../../../Hooks/React Query/Corporation/journal";
import { tranquilityServerStatusQueryOptions } from "../../../Hooks/React Query/tranquilityServerStatus.js";
import {
  ENABLE_QUERY_WATERFALL_LOGGING,
  logWaterfall,
  startQueryTracking,
} from "../../Debugging/queryWaterfallLogger";

/**
 * How many collections the prefetch may have in flight at once.
 *
 * The bound is collections, not characters: capping characters meant three at a time each carrying
 * the whole table, so the ceiling grew with the account. It is not yet a bound on ESI requests —
 * the corporation journal and transactions queries each fan out over seven wallet divisions
 * internally, so one in-flight collection can be seven requests.
 */
const MAX_CONCURRENT_COLLECTIONS = 8;

/**
 * @typedef {Object} PrefetchItem
 * @property {string} name - the collection's name, for tracking
 * @property {string} phase - see `PHASE`; decides its place in the shared queue
 * @property {string} group - ESI rate-limit bucket
 * @property {string} budgetHash - the character whose bucket this request spends
 * @property {Object} query - React Query configuration object
 */

/**
 * Expands the collection table into the work an account actually needs.
 *
 * A `CHARACTER` collection produces one item per character; a `CORPORATION` collection one per
 * distinct corporation among those characters, which is what stops a corporation-wide list being
 * fetched once per member; a `CORPORATION_DIVISION` collection one per corporation *and* wallet
 * division, because ESI grants wallet access a division at a time. `ON_DEMAND` produces none.
 *
 * @param {string[]} characterHashes
 * @param {string} phase
 * @returns {PrefetchItem[]}
 */
export function planPrefetch(characterHashes, phase) {
  const { actions, corporations } = useUsersStore.getState().account;
  const characters = characterHashes
    .map((hash) => actions.findCharacterByHash(hash))
    .filter(Boolean);

  const items = [];

  // On-demand collections have no prefetch work by definition; planning them would quietly undo
  // the decision their table row records.
  if (phase === PHASE.ON_DEMAND) return items;

  for (const collection of COLLECTIONS) {
    if (collection.phase !== phase) continue;

    if (
      collection.scope === SCOPE.CORPORATION ||
      collection.scope === SCOPE.CORPORATION_DIVISION
    ) {
      const perCorporation =
        collection.scope === SCOPE.CORPORATION_DIVISION
          ? CORPORATION_WALLET_DIVISIONS
          : [undefined];
      const seen = new Set();

      for (const character of characters) {
        const corporationId = character.corporation_id;
        if (!corporationId || seen.has(corporationId)) continue;
        seen.add(corporationId);

        for (const division of perCorporation) {
          items.push({
            name: division
              ? `${collection.name} (division ${division})`
              : collection.name,
            phase: collection.phase,
            group: collection.group,
            // A corporation query walks its members and spends the first one's bucket, so the gate
            // here has to consult that same character rather than whichever member was reached
            // first.
            budgetHash:
              firstMemberOf(corporations, corporationId) ??
              character.CharacterHash,
            query: collection.query(corporationId, division),
          });
        }
      }
      continue;
    }

    for (const character of characters) {
      items.push({
        name: collection.name,
        phase: collection.phase,
        group: collection.group,
        budgetHash: character.CharacterHash,
        query: collection.query(character.CharacterHash),
      });
    }
  }

  return items;
}

/**
 * The member whose token a corporation-scoped query will use.
 *
 * @param {Array<Object>|undefined} corporations
 * @param {number|string} corporationId
 * @returns {string|undefined}
 */
function firstMemberOf(corporations, corporationId) {
  const corporation = corporations?.find(
    (c) => Number(c.corporation_id) === Number(corporationId),
  );
  return corporation?.members?.[0];
}

/**
 * True when the item's rate-limit bucket has nothing left to spend.
 *
 * @param {PrefetchItem} item
 * @returns {boolean}
 */
function isBucketExhausted({ group, budgetHash }) {
  const status = getESIRateLimitStatus(group, budgetHash);
  return Boolean(
    status &&
    status.maxTokens &&
    status.windowSize &&
    status.availableTokens <= 0,
  );
}

/**
 * Fetches one item, reporting failure whether or not waterfall logging is on.
 *
 * @param {Object} queryClient
 * @param {PrefetchItem} item
 */
async function fetchItem(queryClient, item) {
  const trackQuery = startQueryTracking(item.name, item.budgetHash);
  try {
    await queryClient.fetchQuery(item.query);
  } catch (error) {
    // Reported unconditionally: an unlogged failure is a collection silently missing with nothing
    // to show for it.
    console.error(`${item.name} prefetch failed for ${item.budgetHash}`, error);
  } finally {
    const duration = trackQuery();
    if (ENABLE_QUERY_WATERFALL_LOGGING) {
      console.log(
        `[${item.budgetHash.slice(0, 8)}] ${item.name} (${duration.toFixed(0)}ms)`,
      );
    }
  }
}

/**
 * The work every live prefetch shares.
 *
 * Login warms the main character and the linked characters from two places, because the account
 * sync builds only the characters not already in the store. Giving each call its own queue meant
 * each also had its own phase order and its own budget: the second call's first-paint work queued
 * behind the first call's deferred work, and the two together allowed twice the requests in flight.
 * One queue for the page is what makes a phase mean anything and a budget hold.
 *
 * @type {Map<string, PrefetchItem[]>}
 */
const queued = new Map();

/** Query keys already queued or in flight, so two callers do not schedule the same fetch. */
const claimed = new Set();

/** The drain in progress, for callers to await. */
let draining = null;

/**
 * Whether a drain is still asking the queue for work.
 *
 * Separate from `draining` because a drain that finds nothing to do finishes before the assignment
 * of its own promise lands, which would leave `draining` holding a settled promise that no later
 * caller could get past.
 */
let drainActive = false;

/**
 * @param {Object} query - React Query configuration object
 * @returns {string}
 */
function claimKey(query) {
  return JSON.stringify(query.queryKey);
}

/**
 * Adds a phase's work to the shared queue, skipping what is already scheduled.
 *
 * @param {string} phase
 * @param {PrefetchItem[]} items
 */
function enqueue(phase, items) {
  const held = queued.get(phase) ?? [];

  for (const item of items) {
    const key = claimKey(item.query);
    if (claimed.has(key)) continue;
    claimed.add(key);
    held.push(item);
  }

  queued.set(phase, held);
}

/**
 * The next item to run, taken from the earliest phase holding work.
 *
 * Earliest rather than the caller's own phase: a character whose first-paint collections arrive
 * while another character's deferred work is still queued should not wait behind it.
 *
 * @param {Set<string>} deferred - keys held back this pass because their bucket is spent
 * @returns {PrefetchItem|undefined}
 */
function nextItem(deferred) {
  for (const phase of PREFETCHED_PHASES) {
    const held = queued.get(phase);
    if (!held?.length) continue;

    const index = held.findIndex((item) => !deferred.has(claimKey(item.query)));
    if (index === -1) continue;

    return held.splice(index, 1)[0];
  }
  return undefined;
}

/**
 * Runs the shared queue until it is empty, at most {@link MAX_CONCURRENT_COLLECTIONS} in flight.
 *
 * An item whose rate-limit bucket is spent is held back rather than fired into a refusal. When
 * every remaining item is held back the drain stops and those consumers fetch on mount.
 *
 * @param {Object} queryClient
 */
async function drain(queryClient) {
  const running = new Set();
  const deferred = new Set();

  try {
    for (;;) {
      if (running.size >= MAX_CONCURRENT_COLLECTIONS) {
        await Promise.race(running);
        continue;
      }

      const item = nextItem(deferred);

      if (!item) {
        if (running.size === 0) break;
        // A slot freeing can also free a bucket, so held-back work is offered again.
        await Promise.race(running);
        deferred.clear();
        continue;
      }

      const key = claimKey(item.query);

      if (isBucketExhausted(item)) {
        deferred.add(key);
        queued.get(item.phase).push(item);
        continue;
      }

      const task = fetchItem(queryClient, item).finally(() => {
        running.delete(task);
        claimed.delete(key);
      });
      running.add(task);
    }
  } finally {
    // Synchronous from the moment the loop finds nothing left, with no await in between. A caller
    // enqueueing in a gap here would be handed this same drain promise, which has already stopped
    // asking for work — its collections would be dropped while its await resolved as a success.
    claimed.clear();
    queued.clear();
    drainActive = false;
  }
}

/**
 * Starts the drain if one is not already running, and resolves when the queue is empty.
 *
 * @param {Object} queryClient
 * @returns {Promise<void>}
 */
function ensureDraining(queryClient) {
  if (drainActive) return draining;

  drainActive = true;
  draining = drain(queryClient);
  return draining;
}

/**
 * Whether Tranquility is known to be online, waiting for the answer if it has not arrived.
 *
 * Every collection query disables itself until this is cached, and the status is fetched at app
 * start in parallel with login — so a prefetch that plans before it lands builds a table of
 * disabled queries, drops every one of them, and reports success having fetched nothing.
 *
 * @param {Object} queryClient
 * @returns {Promise<boolean>}
 */
async function tranquilityIsOnline(queryClient) {
  try {
    const status = await queryClient.ensureQueryData(
      tranquilityServerStatusQueryOptions(),
    );
    return status?.online === true;
  } catch (error) {
    console.error("Tranquility status unavailable; nothing prefetched", error);
    return false;
  }
}

/**
 * Warms the ESI collections an account needs, in phase order.
 *
 * This is the single entry point for login. Query definitions decide for themselves whether they
 * may run — a logged-out session or a Tranquility outage disables them — and that decision is
 * honoured here rather than overridden, so an outage no longer means firing the whole table at an
 * offline server.
 *
 * @param {Object} queryClient - React Query client instance
 * @param {string[]} characterHashes
 * @param {boolean} [shouldLog] - print the query waterfall when it finishes
 */
export async function prefetchCollections(
  queryClient,
  characterHashes,
  shouldLog = false,
) {
  const hashes = characterHashes?.filter(Boolean) ?? [];
  if (hashes.length === 0) return;

  const start = performance.now();

  if (!(await tranquilityIsOnline(queryClient))) return;

  for (const phase of PREFETCHED_PHASES) {
    const items = planPrefetch(hashes, phase).filter(
      (item) => item.query.enabled !== false,
    );
    if (items.length > 0) {
      enqueue(phase, items);
    }
  }

  await ensureDraining(queryClient);

  if (shouldLog) {
    const duration = performance.now() - start;
    console.log(
      `Prefetch complete for ${hashes.length} character(s) in ${duration.toFixed(2)}ms`,
    );
    logWaterfall();
  }
}
