import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore";
import { nameQuery } from "../React Query/World/names";
import { asNumberIDSet } from "../../Functions/Helper/ids";

const EMPTY_NAMES = {};
const EMPTY_FAILED = new Set();
const EMPTY_LIKELY = new Map();

/**
 * Names for a set of locations, resolved once for the whole app.
 *
 * Each id is its own cache entry, so a name resolved for one view is present in the next without
 * being asked for again, and an id that could not be resolved is a failure against that id rather
 * than a hole in this view's set. The batching that keeps one entry per id from becoming one request
 * per id belongs to the loader beneath the query.
 *
 * A structure is refused by every character without docking rights, and each refusal costs five
 * times what an answer does, so a caller that knows whose assets, jobs or orders a structure turned
 * up in says so through `likely` and that character is asked first. The rest of the account still
 * follows it, and the community store still sits under that, so a stale hint costs nothing beyond
 * the walk that would have happened anyway.
 *
 * `failed` carries the ids whose lookup did not settle. A failure is deliberately never cached, so
 * such an id has no entry in `names` and is indistinguishable there from one still being asked
 * about — which is what a surface showing what it could not resolve has to tell apart.
 *
 * @param {Array<number>|Set<number>} [locationIds]
 * @param {Map<number, Iterable<string>|string>} [likely] - per location, the hashes of characters
 *   known to have seen it; memoise it, as an identity that changes each render rebuilds the queries
 * @returns {{names: Object<string, Object>, failed: Set<number>, isLoading: boolean, isError: boolean, error: Error|null}}
 */
export default function useLocationNames(locationIds, likely = EMPTY_LIKELY) {
  const characters = useUsersStore((store) => store.account.characters);

  const requested = useMemo(
    () => [...asNumberIDSet(locationIds)].sort((a, b) => a - b),
    [locationIds],
  );

  return useQueries({
    queries: requested.map((id) =>
      nameQuery(id, characters ?? [], hashesFor(likely.get(id))),
    ),
    combine: (results) => {
      const found = {};
      const failed = new Set();
      let pending = false;
      let failure = null;

      results.forEach((result, index) => {
        // An id ESI answered about and did not name is an answer, and is handed on like any other:
        // a surface showing it says the place has no name rather than leaving a gap where one was
        // asked for. Only an id still being asked about is absent from here.
        if (result.data) {
          found[requested[index]] = result.data;
        }
        if (result.isLoading) pending = true;
        if (result.error) {
          failed.add(requested[index]);
          if (!failure) failure = result.error;
        }
      });

      return {
        names: Object.keys(found).length > 0 ? found : EMPTY_NAMES,
        failed: failed.size > 0 ? failed : EMPTY_FAILED,
        isLoading: pending,
        isError: Boolean(failure),
        error: failure ?? null,
      };
    },
  });
}

/**
 * The `likely` argument, built from rows that each name a location and the character it came from.
 *
 * Every caller has the same pair to hand and nothing else — a linked run's station and the hash it
 * was linked under, a market order's location and its seller, an asset node's location and whose set
 * it arrived in — so the shape of the hint is owned here rather than assembled row by row at each
 * surface. A pair missing either half is dropped: a location with nothing known about it is asked
 * for the way it always was.
 *
 * @param {Iterable<[number|string|null, string|null]>} pairs - location id and character hash
 * @returns {Map<number, Set<string>>}
 */
export function charactersByLocation(pairs) {
  const likely = new Map();

  for (const [locationId, characterHash] of pairs) {
    if (!locationId || !characterHash) continue;
    const id = Number(locationId);
    if (!likely.has(id)) likely.set(id, new Set());
    likely.get(id).add(characterHash);
  }

  return likely;
}

/**
 * One location's hint as hashes, whether the caller gave one character or several.
 *
 * @param {Iterable<string>|string} [entry]
 * @returns {Iterable<string>}
 */
function hashesFor(entry) {
  if (!entry) return [];
  return typeof entry === "string" ? [entry] : entry;
}
