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

/**
 * Raw SSO hash strings from session `linked_characters` (bootstrap/login), deduped by canonical key.
 *
 * @param {unknown} linkedCharacters
 * @returns {string[] | null} `null` when empty or not an array
 */
export function dedupeLinkedCharacterHashStrings(linkedCharacters) {
  if (!Array.isArray(linkedCharacters)) return null;
  const seen = new Set();
  const out = [];
  for (const row of linkedCharacters) {
    if (!row || typeof row !== "object") continue;
    const raw =
      typeof row.characterHash === "string"
        ? row.characterHash
        : typeof row.CharacterHash === "string"
          ? row.CharacterHash
          : "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = canonicalCharacterHashKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.length > 0 ? out : null;
}
