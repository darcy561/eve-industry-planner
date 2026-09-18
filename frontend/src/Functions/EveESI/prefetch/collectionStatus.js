import { COLLECTIONS, PHASE, SCOPE } from "./collections";
import { CORPORATION_WALLET_DIVISIONS } from "../../../Hooks/React Query/Corporation/journal";
import { tokenHasScope } from "../../Auth/esiCredentials/tokenScopes";

/**
 * What the application holds of one ESI collection for one character.
 *
 * @enum {string}
 */
export const COLLECTION_STATE = Object.freeze({
  /** Held, and recent enough to trust. */
  FRESH: "fresh",
  /** Held, but older than the collection's own refresh expectation. */
  STALE: "stale",
  /** Not fetched at login by design, so its absence is correct rather than a fault. */
  ON_DEMAND: "on-demand",
  /** Prefetched, but nothing has arrived — login may still be running, or its fetch failed. */
  MISSING: "missing",
  /** The token was never granted the scope this collection needs. */
  UNAVAILABLE: "unavailable",
  /** Held nothing because the last fetch threw — a refusal, a rate limit, a network fault. */
  FAILED: "failed",
});

/** Worst first: what an aggregate over several queries reports. */
const SEVERITY = [
  COLLECTION_STATE.UNAVAILABLE,
  COLLECTION_STATE.FAILED,
  COLLECTION_STATE.MISSING,
  COLLECTION_STATE.ON_DEMAND,
  COLLECTION_STATE.STALE,
  COLLECTION_STATE.FRESH,
];

/**
 * The queries one collection is held in for one character.
 *
 * A wallet collection is granted a division at a time and is fetched per division, so its state is
 * the aggregate over all seven rather than any one of them.
 *
 * @param {{scope: string, query: Function}} collection
 * @param {{characterHash: string, corporationId?: number|string}} context
 * @returns {Array<{queryKey: Array, staleTime?: number}>}
 */
function queriesFor(collection, { characterHash, corporationId }) {
  if (collection.scope === SCOPE.CORPORATION_DIVISION) {
    if (!corporationId) return [];
    return CORPORATION_WALLET_DIVISIONS.map((division) =>
      collection.query(corporationId, division),
    );
  }
  if (collection.scope === SCOPE.CORPORATION) {
    return corporationId ? [collection.query(corporationId)] : [];
  }
  return [collection.query(characterHash)];
}

/**
 * The state of one query, and when its data last arrived.
 *
 * @param {object} queryClient - React Query client instance
 * @param {{queryKey: Array, staleTime?: number}} config
 * @param {string} phase
 * @param {number} now
 * @returns {{state: string, at: number|null}}
 */
function stateOfQuery(queryClient, config, phase, now) {
  const held = queryClient.getQueryState(config.queryKey);

  // Not "unavailable": the queries throw plain errors for a rate limit and for an ESI refusal
  // alike, so the reason cannot be recovered here, and claiming no access for a character who has
  // it sends a reader to re-authorise for nothing.
  if (held?.status === "error") {
    return { state: COLLECTION_STATE.FAILED, at: null };
  }
  if (held?.data === undefined) {
    return {
      state:
        phase === PHASE.ON_DEMAND
          ? COLLECTION_STATE.ON_DEMAND
          : COLLECTION_STATE.MISSING,
      at: null,
    };
  }

  // The collection's own query decides how long its data stays good, so the page does not carry a
  // second opinion about how old is too old.
  const staleAfter = config.staleTime ?? 0;
  return {
    state:
      now - held.dataUpdatedAt > staleAfter
        ? COLLECTION_STATE.STALE
        : COLLECTION_STATE.FRESH,
    at: held.dataUpdatedAt,
  };
}

/**
 * What the application holds of one collection for one character, and how old it is.
 *
 * This is the single question the Accounts page asks. What answers it today is React Query, which
 * knows only about this session; the page is written against this function rather than against the
 * cache so that a durable record can replace the source without the display changing.
 *
 * @param {object} queryClient - React Query client instance
 * @param {object} collection - a row of `COLLECTIONS`
 * @param {object} context
 * @param {string} context.characterHash
 * @param {number|string} [context.corporationId] - the character's corporation
 * @param {string} [context.accessToken] - the character's held ESI access token, for its scopes
 * @param {number} [now] - unix milliseconds
 * @returns {{state: string, at: number|null}}
 */
export function collectionStatus(
  queryClient,
  collection,
  { characterHash, corporationId, accessToken = "" },
  now = Date.now(),
) {
  // A token keeps the scopes it was issued with, so a character linked before a scope was added
  // cannot serve the collection however healthy its credentials are.
  if (collection.esiScope && !tokenHasScope(accessToken, collection.esiScope)) {
    return { state: COLLECTION_STATE.UNAVAILABLE, at: null };
  }

  const configs = queriesFor(collection, { characterHash, corporationId });
  if (configs.length === 0) {
    return { state: COLLECTION_STATE.UNAVAILABLE, at: null };
  }

  const answers = configs.map((config) =>
    stateOfQuery(queryClient, config, collection.phase, now),
  );
  const worst = SEVERITY.find((state) =>
    answers.some((answer) => answer.state === state),
  );
  const ages = answers.map((answer) => answer.at).filter((at) => at != null);

  return { state: worst, at: ages.length ? Math.min(...ages) : null };
}

/**
 * @param {object} queryClient
 * @param {Array} collections - the rows to answer for
 * @param {object} context - as {@link collectionStatus}
 * @param {number} [now]
 * @returns {Array<{key: string, name: string, state: string, at: number|null}>}
 */
function statusesOf(queryClient, collections, context, now) {
  return collections.map((collection) => ({
    key: collection.key,
    name: collection.name,
    ...collectionStatus(queryClient, collection, context, now),
  }));
}

/**
 * What is held for one character, in the table's own order.
 *
 * Corporation assets are among them: ESI limits that list to what the asking character can see, so
 * it is fetched per character and means something different for each of them.
 *
 * @param {object} queryClient - React Query client instance
 * @param {object} context - as {@link collectionStatus}
 * @param {number} [now]
 * @returns {Array<{key: string, name: string, state: string, at: number|null}>}
 */
export function characterCollectionStatuses(queryClient, context, now) {
  return statusesOf(
    queryClient,
    COLLECTIONS.filter((collection) => collection.scope === SCOPE.CHARACTER),
    context,
    now,
  );
}

/**
 * What is held for one corporation.
 *
 * Answered once per corporation rather than once per member, because that is how these are
 * fetched: the whole list comes back to any member holding the role.
 *
 * @param {object} queryClient - React Query client instance
 * @param {object} context - as {@link collectionStatus}, with `corporationId`
 * @param {number} [now]
 * @returns {Array<{key: string, name: string, state: string, at: number|null}>}
 */
export function corporationCollectionStatuses(queryClient, context, now) {
  return statusesOf(
    queryClient,
    COLLECTIONS.filter((collection) => collection.scope !== SCOPE.CHARACTER),
    context,
    now,
  );
}
