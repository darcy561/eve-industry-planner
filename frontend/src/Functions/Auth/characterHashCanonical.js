/**
 * SSO `owner` strings compared case-insensitively for lookups and merges.
 *
 * @param {string | undefined | null} hash
 * @returns {string}
 */
export function canonicalCharacterHashKey(hash) {
  if (typeof hash !== "string") return "";
  const t = hash.trim();
  return t ? t.toLowerCase() : "";
}

/**
 * @param {{ CharacterHash: string }[]} characters
 * @param {string} characterHash
 * @returns {boolean}
 */
export function isCharacterInListByHash(characters, characterHash) {
  const c = canonicalCharacterHashKey(characterHash);
  if (!c) return false;
  return characters.some(
    (u) => canonicalCharacterHashKey(u?.CharacterHash) === c
  );
}
