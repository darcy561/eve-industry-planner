import { requestEsiAccessFromServerStorage } from "../../Endpoints/esiAccessClient.js";

/**
 * Server-held OAuth refresh (Mongo) → ESI access JWT via
 * `POST /api/v1/esi/characters/access-token/server`.
 *
 * @param {string} characterHash
 * @returns {Promise<object|Error>}
 */
async function refreshEsiAccessTokenFromServerStoredCredential(characterHash) {
  try {
    return await requestEsiAccessFromServerStorage(characterHash);
  } catch (err) {
    console.error(err.message);
    return err instanceof Error ? err : new Error(String(err));
  }
}

export default refreshEsiAccessTokenFromServerStoredCredential;
