/**
 * Drops everything React Query holds for one character.
 *
 * Character-scoped collections are keyed by the character hash, so the hash is what identifies
 * them. Corporation-scoped collections are keyed by corporation and are deliberately left: they
 * are shared by every member, and clearing one character's data must not take another's with it.
 *
 * @param {object} queryClient - React Query client instance
 * @param {string} characterHash
 */
export function clearCharacterEsiCache(queryClient, characterHash) {
  if (!characterHash) return;
  queryClient.removeQueries({
    predicate: (query) => query.queryKey.includes(characterHash),
  });
}
