import { requestName } from "../../../Functions/EveESI/World/nameLoader";
import { LOCATION_OUTCOME } from "../../../Functions/EveESI/World/locationOutcome";
import retryUnlessPermanent from "../retryUnlessPermanent";
import { asNumberIDSet } from "../../../Functions/Helper/ids";

/** Every entry this cache holds sits under this prefix, one id deep. */
const NAME_QUERY_KEY = ["esi", "name"];

/**
 * One location's name, cached under that location's id.
 *
 * Keyed by the id and nothing else, which is the point: every view wanting a structure shares one
 * entry, so a name resolved on one page is present on the next, and an id that could not be
 * resolved is a failure on that id rather than a hole in some page's set. Keying by the set a page
 * happened to want is what let one page hold a cached gap the next page could not see.
 *
 * Neither the characters nor the hint are part of the key. A location's name is a fact about the
 * location; which of the account's characters managed to read it, and which one a caller thought
 * would, are not something a consumer should have to match on. The cost is that a hint arriving
 * after the entry already exists does not reach the walk — the answer is already on its way.
 *
 * @param {number} id
 * @param {Array<Object>} characters - the account's characters, tried in order for a structure
 * @param {Iterable<string>} [likely] - hashes of characters known to have seen this structure
 * @returns {object} React Query configuration
 */
export function nameQuery(id, characters = [], likely = []) {
  return {
    queryKey: [...NAME_QUERY_KEY, id],
    queryFn: () => requestName(id, characters, likely),
    enabled: Boolean(id) && characters.length > 0,
    // A name does not change while the app is open, and every settled outcome — including a refusal
    // — is an answer worth keeping. A failure is not cached at all: it rejects, and is retried.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: retryUnlessPermanent(2),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  };
}

/**
 * Names for a set of locations, fetched rather than subscribed.
 *
 * For the call sites that resolve names inside a flow they are already running — a match being
 * linked, an office being read — where a hook cannot be called. It shares the cache the hook
 * subscribes to, so a name fetched here is present for every view that later asks for it, and one
 * already held is not asked for again.
 *
 * An id that fails is left out rather than failing the set: these callers resolve names as a side
 * errand, and the flow they belong to should not stop because a name did not arrive. Nothing is
 * cached for it, so the next ask retries. An id that settled as `UNNAMED` is left out too — it is an
 * answer, but not a name to show — tested by its outcome rather than by whether it carries one, so a
 * future outcome with an empty name is not silently dropped with it.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {Array<number>|Set<number>} ids_
 * @param {Array<Object>} [characters] - only a structure needs one; a station, a system or a
 *   corporation is named without any
 * @returns {Promise<Object<string, Object>>} what was named, keyed by location id
 */
export async function fetchNames(queryClient, ids_, characters = []) {
  const ids = [...asNumberIDSet(ids_)];
  if (ids.length === 0) return {};

  const settled = await Promise.allSettled(
    ids.map((id) => queryClient.fetchQuery(nameQuery(id, characters))),
  );

  const names = {};
  settled.forEach((result, index) => {
    if (
      result.status === "fulfilled" &&
      result.value?.resolutionStatus !== LOCATION_OUTCOME.UNNAMED
    ) {
      names[ids[index]] = result.value;
    }
  });
  return names;
}

/**
 * Forgets what is known about these ids, so the next view asking for them resolves them again.
 *
 * A settled outcome is kept for the session, which is right while the account is the same account:
 * a structure that refused every linked character will refuse them again. It stops being right when
 * what the account can see changes — a character linked, a corporation or alliance joined or left —
 * because a `no-access` entry then states something that is no longer true and nothing else would
 * ever re-ask it.
 *
 * Nothing calls this yet. It exists so that whatever comes to watch for those changes has somewhere
 * to say so, rather than having to reach into the cache's keys from outside.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {Array<number>|Set<number>} [ids] - the ids to forget; every name when omitted
 */
export function forgetNames(queryClient, ids) {
  const wanted = [...asNumberIDSet(ids)];
  if (wanted.length === 0) {
    queryClient.removeQueries({ queryKey: NAME_QUERY_KEY });
    return;
  }
  for (const id of wanted) {
    queryClient.removeQueries({ queryKey: [...NAME_QUERY_KEY, id] });
  }
}
