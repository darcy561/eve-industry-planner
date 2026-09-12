import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import useUsersStore from "../../Zustand/usersStore";
import { nameQuery } from "../React Query/World/names";
import { asNumberIDSet } from "../../Functions/Helper/ids";

const EMPTY_NAMES = {};
const EMPTY_FAILED = new Set();

/**
 * Names for a set of locations, resolved once for the whole app.
 *
 * Each id is its own cache entry, so a name resolved for one view is present in the next without
 * being asked for again, and an id that could not be resolved is a failure against that id rather
 * than a hole in this view's set. The batching that keeps one entry per id from becoming one request
 * per id belongs to the loader beneath the query.
 *
 * `failed` carries the ids whose lookup did not settle. A failure is deliberately never cached, so
 * such an id has no entry in `names` and is indistinguishable there from one still being asked
 * about — which is what a surface showing what it could not resolve has to tell apart.
 *
 * @param {Array<number>|Set<number>} [locationIds]
 * @returns {{names: Object<string, Object>, failed: Set<number>, isLoading: boolean, isError: boolean, error: Error|null}}
 */
export default function useLocationNames(locationIds) {
  const characters = useUsersStore((store) => store.account.characters);

  const requested = useMemo(
    () => [...asNumberIDSet(locationIds)].sort((a, b) => a - b),
    [locationIds],
  );

  return useQueries({
    queries: requested.map((id) => nameQuery(id, characters ?? [])),
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
