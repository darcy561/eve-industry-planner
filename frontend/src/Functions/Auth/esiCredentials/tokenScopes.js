/** What `GET /universe/structures/{id}` requires of a character's token. */
export const STRUCTURE_SCOPE = "esi-universe.read_structures.v1";

/** What `GET /markets/structures/{id}` requires of a character's token. */
export const MARKET_STRUCTURE_SCOPE = "esi-markets.structure_markets.v1";

/**
 * The scopes an access token was actually issued with.
 *
 * A token keeps the scopes it was authorised with: adding one to the application does not widen a
 * token already issued, so a character linked before a scope existed holds a token that will never
 * carry it. ESI refuses such a call with the same 403 a character without docking rights receives,
 * which is why this is read rather than inferred from the response.
 *
 * The claims are read without verifying the signature, deliberately: this asks what the app was
 * granted, and ESI remains the authority on whether the token is honoured.
 *
 * @param {string} accessToken - an EVE SSO access token (a JWT)
 * @returns {string[]} the `scp` claim, or an empty list if it cannot be read
 */
export function scopesFromAccessToken(accessToken) {
  if (typeof accessToken !== "string") return [];
  const payload = accessToken.split(".")[1];
  if (!payload) return [];

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json);
    if (Array.isArray(claims?.scp)) return claims.scp;
    // A token granted exactly one scope carries it as a bare string.
    if (typeof claims?.scp === "string") return [claims.scp];
    return [];
  } catch {
    return [];
  }
}

/**
 * Whether a token carries a scope.
 *
 * A token whose claims cannot be read is treated as carrying it: the call is then made and ESI
 * answers, which is a better failure than refusing to ask on the strength of an unreadable token.
 *
 * @param {string} accessToken
 * @param {string} scope
 * @returns {boolean}
 */
export function tokenHasScope(accessToken, scope) {
  const scopes = scopesFromAccessToken(accessToken);
  if (scopes.length === 0) return true;
  return scopes.includes(scope);
}
