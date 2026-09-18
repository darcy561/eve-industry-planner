import { upsertCloudStoredEsiRefreshTokens } from "../Endpoints/Private/cloudStoredEsiRefreshTokens.js";

/**
 * Sends linked characters' refresh secrets to the server.
 *
 * Shared by the two surfaces that put them there: importing a character while the account is in
 * cloud mode, and moving what the browser holds when the account switches to it.
 *
 * @param {Map<string, string>} tokenOverrides - character hash to refresh secret
 * @returns {Promise<void>}
 * @throws {Error} when the server refuses the write
 */
export async function submitCloudLinkedCharacterRefreshTokens(
  tokenOverrides = new Map(),
) {
  const payload = [];
  for (const [hash, token] of tokenOverrides.entries()) {
    const characterHash = typeof hash === "string" ? hash.trim() : "";
    if (!characterHash || !token) continue;
    payload.push({ CharacterHash: characterHash, rToken: token });
  }
  if (payload.length === 0) return;

  const ok = await upsertCloudStoredEsiRefreshTokens(payload);
  if (!ok) {
    throw new Error("Failed to submit linked character token to server");
  }
}

/**
 * The refresh secrets the roster is holding in memory, for a move to the cloud that finds nothing
 * in local storage to send.
 *
 * The main character is left out: its secret is the account's own and does not travel with the
 * linked characters.
 *
 * @param {Array<object>} [characterRows]
 * @returns {Map<string, string>}
 */
export function buildTokenOverridesFromCharacters(characterRows = []) {
  const overrides = new Map();
  for (const row of characterRows) {
    if (!row || row.isMainCharacter) continue;
    const characterHash =
      typeof row.CharacterHash === "string" ? row.CharacterHash.trim() : "";
    const token =
      typeof row.esiRefreshToken === "string" ? row.esiRefreshToken.trim() : "";
    if (!characterHash || !token) continue;
    overrides.set(characterHash, token);
  }
  return overrides;
}
