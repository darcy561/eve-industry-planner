import { useQueries } from "@tanstack/react-query";
import { useCallback } from "react";

import { characterSkillsQuery } from "./skills";
import { characterStandingsQuery } from "./standings";
import { isQueryObserverResultLoading } from "../../EveEsi/queryLoadingState";

/**
 * The two reads every broker fee and sales tax is worked out from, subscribed
 * for a set of characters.
 *
 * @param {string[]|string} characterHashes
 * @returns {{isLoading: boolean, isError: boolean, error: Error|null, updatedAt: number}}
 */
export function useSellingRateInputs(characterHashes) {
  const hashes = [
    ...new Set(
      (Array.isArray(characterHashes)
        ? characterHashes
        : [characterHashes]
      ).filter(Boolean),
    ),
  ];

  const combine = useCallback((results) => {
    const error = results.find((result) => result.error)?.error ?? null;

    return {
      isLoading: results.some(isQueryObserverResultLoading),
      isError: Boolean(error),
      error,
      // What the cached accessors would return, as one number. A caller keying a
      // derived query on this recomputes when either read lands, rather than
      // caching a figure worked out before they arrived.
      updatedAt: results.reduce(
        (latest, result) => Math.max(latest, result.dataUpdatedAt ?? 0),
        0,
      ),
    };
  }, []);

  return useQueries({
    queries: hashes.flatMap((hash) => [
      characterSkillsQuery(hash),
      characterStandingsQuery(hash),
    ]),
    combine,
  });
}

/**
 * Puts the same two reads in the cache for one character, fetching them only
 * where they are not there already.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string|null} characterHash
 * @returns {Promise<void>}
 */
export async function ensureSellingRateInputs(queryClient, characterHash) {
  if (!characterHash) return;

  await Promise.all([
    queryClient.query({
      ...characterSkillsQuery(characterHash),
      staleTime: "static",
    }),
    queryClient.query({
      ...characterStandingsQuery(characterHash),
      staleTime: "static",
    }),
  ]);
}
