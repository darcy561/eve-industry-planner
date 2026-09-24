import { useQueries } from "@tanstack/react-query";
import { useCallback } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import {
  isQueryObserverResultLoading,
  isQueryStateLoading,
} from "../queryLoadingState";

/**
 * The shape every character collection hands its consumers.
 *
 * @typedef {Object} CharacterCollection
 * @property {Object<string, *>} data - each character's rows, keyed by character hash
 * @property {boolean} isLoading
 * @property {boolean} isError
 * @property {Error|null} error
 */

/**
 * @param {Object<string, *>} data
 * @param {boolean} isLoading
 * @param {Error|null} error
 * @returns {CharacterCollection}
 */
function state(data, isLoading, error) {
  return { data, isLoading, isError: Boolean(error), error: error ?? null };
}

/**
 * The rows out of a payload, for the collections that are lists of rows.
 *
 * Some character queries resolve to the rows themselves and some to an object
 * carrying them beside the character they belong to, so a consumer would
 * otherwise have to know which of the two its endpoint does. A collection whose
 * payload is not a list of rows at all — a character's skills are a map keyed by
 * skill id — passes its own `rows` instead.
 *
 * @param {Array<Object>|{data?: Array<Object>}|undefined} payload
 * @returns {Array<Object>}
 */
export function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

/**
 * Keys each payload's rows by the character it was fetched for.
 *
 * Paired by position, not by anything in the payload: an ESI response for a
 * character carries no hash, and both the queries and these keys are built by
 * mapping the same character list in the same order. Anything that fetches some
 * other set of characters must key them itself rather than call this.
 *
 * @param {Array<{CharacterHash: string}>} characters
 * @param {Array<*>} payloads - One per character, in the same order
 * @param {(payload: *) => *} [rows] - How this collection reads one payload
 * @returns {Object<string, *>}
 */
export function keyRowsByCharacter(characters, payloads, rows = rowsOf) {
  const byCharacter = {};

  (characters ?? []).forEach((character, index) => {
    const hash = character?.CharacterHash;
    if (!hash) return;
    byCharacter[hash] = rows(payloads[index]);
  });

  return byCharacter;
}

/**
 * Every linked character, or an empty list before the account has loaded.
 *
 * @returns {Array<Object>}
 */
function linkedCharacters() {
  return useUsersStore.getState().account.characters ?? [];
}

/**
 * Reads a character collection from the cache without triggering a fetch.
 *
 * @param {Object} queryClient - React Query client instance
 * @param {string} queryKeyRoot
 * @param {{rows?: (payload: *) => *}} [options] - `rows` reads one character's payload
 * @returns {CharacterCollection}
 */
export function readCharacterCollection(
  queryClient,
  queryKeyRoot,
  options = {},
) {
  const { rows = rowsOf } = options;
  const characters = linkedCharacters();

  const queryStates = characters.map(({ CharacterHash }) => {
    const queryKey = [queryKeyRoot, CharacterHash];
    return {
      queryState: queryClient.getQueryState(queryKey),
      cachedData: queryClient.getQueryData(queryKey),
    };
  });

  if (queryStates.some(({ queryState }) => isQueryStateLoading(queryState))) {
    return state({}, true, null);
  }

  const error = queryStates.find(({ queryState }) => queryState?.error)
    ?.queryState?.error;

  if (error) {
    return state({}, false, error);
  }

  return state(
    keyRowsByCharacter(
      characters,
      queryStates.map(({ cachedData }) => cachedData),
      rows,
    ),
    false,
    null,
  );
}

/**
 * Subscribes to a character collection across every linked character.
 *
 * @param {Function} queryFactory - takes a character hash
 * @param {{enabled?: boolean, rows?: (payload: *) => *}} [options] - `enabled` false holds
 *     every query off; `rows` reads one character's payload
 * @returns {CharacterCollection}
 */
export function useCharacterCollection(queryFactory, options = {}) {
  const characters = useUsersStore((store) => store.account.characters);
  const { enabled = true, rows = rowsOf } = options;

  const combine = useCallback(
    (results) => {
      if (results.some(isQueryObserverResultLoading)) {
        return state({}, true, null);
      }

      const error = results.find((result) => result?.error)?.error ?? null;
      if (error) {
        return state({}, false, error);
      }

      return state(
        keyRowsByCharacter(
          characters,
          results.map((result) => result?.data),
          rows,
        ),
        false,
        null,
      );
    },
    [characters, rows],
  );

  return useQueries({
    queries: (characters ?? []).map(({ CharacterHash }) => {
      const query = queryFactory(CharacterHash);
      return { ...query, enabled: enabled && query.enabled };
    }),
    combine,
  });
}
