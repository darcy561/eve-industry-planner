/**
 * ESI access tokens, acquired at the point of use.
 *
 * Access tokens are held here rather than on `Character` in Zustand: nothing renders from a token, so
 * a refresh that wrote the store would re-render every subscriber of `account.characters` for a value
 * none of them display. Identity belongs in the store; credentials belong here.
 */
import { decodeJwt } from "jose";
import {
  createClientHeldCredentials,
  serverStoredCredentials,
} from "./strategies.js";
import {
  EsiCredentialError,
  ESI_CREDENTIAL_REAUTH_REQUIRED,
  isReauthRequired,
} from "./errors.js";
import {
  CREDENTIAL_HEALTH,
  forgetCredentialHealth,
  recordCredentialHealth,
  resetCredentialHealth,
} from "./health.js";
import useUsersStore from "../../../Zustand/usersStore.js";

/** Refresh when fewer than this many seconds remain, matching the ESI access token's ~20m life. */
const ESI_ACCESS_TOKEN_BUFFER_SEC = 660;

/**
 * @param {object} deps
 * @param {() => object} deps.strategy - Resolves the storage strategy per call, since an account can
 *   switch between cloud and local while the app is running.
 * @param {() => number} [deps.now] - Unix seconds.
 */
export function createEsiCredentialProvider({
  strategy,
  now = () => Math.floor(Date.now() / 1000),
}) {
  /** @type {Map<string, { accessToken: string, exp: number }>} */
  const tokens = new Map();
  /** @type {Map<string, Promise<{ accessToken: string, exp: number }>>} */
  const inflight = new Map();

  function fresh(characterHash, minRemainingSec) {
    const held = tokens.get(characterHash);
    if (!held) return null;
    return held.exp > now() + minRemainingSec ? held : null;
  }

  /**
   * @param {string} characterHash
   * @param {object} [options]
   * @param {number} [options.minRemainingSec]
   * @returns {Promise<{ accessToken: string, exp: number }>}
   * @throws {EsiCredentialError}
   */
  async function getEsiAccessToken(characterHash, options = {}) {
    const { minRemainingSec = ESI_ACCESS_TOKEN_BUFFER_SEC } = options;
    if (
      typeof characterHash !== "string" ||
      characterHash.trim().length === 0
    ) {
      throw new EsiCredentialError(
        "character hash is required to acquire an ESI access token",
        ESI_CREDENTIAL_REAUTH_REQUIRED,
      );
    }

    const held = fresh(characterHash, minRemainingSec);
    if (held) return held;

    const pending = inflight.get(characterHash);
    if (pending) return pending;

    const attempt = (async () => {
      try {
        const token = await strategy().refresh(characterHash);
        tokens.set(characterHash, token);
        recordCredentialHealth(characterHash, CREDENTIAL_HEALTH.OK);
        return token;
      } catch (error) {
        recordCredentialHealth(
          characterHash,
          isReauthRequired(error)
            ? CREDENTIAL_HEALTH.REAUTH_REQUIRED
            : CREDENTIAL_HEALTH.DEGRADED,
        );
        throw error;
      }
    })();

    inflight.set(characterHash, attempt);
    try {
      return await attempt;
    } finally {
      if (inflight.get(characterHash) === attempt) {
        inflight.delete(characterHash);
      }
    }
  }

  /**
   * Takes ownership of a token another flow already obtained — login and bootstrap exchange refresh
   * material to build a `Character`, and the access token that falls out is the one to hold.
   *
   * @param {string} characterHash
   * @param {string} accessToken
   */
  function adoptEsiAccessToken(characterHash, accessToken) {
    if (
      !characterHash ||
      typeof accessToken !== "string" ||
      !accessToken.trim()
    ) {
      return;
    }
    const exp = Number(decodeJwt(accessToken).exp) || 0;
    tokens.set(characterHash, { accessToken, exp });
    recordCredentialHealth(characterHash, CREDENTIAL_HEALTH.OK);
  }

  /**
   * Acquires a token for a character whether or not one is held, for a reader asking the
   * application to try this character's credentials again.
   *
   * @param {string} characterHash
   * @returns {Promise<{ accessToken: string, exp: number }>}
   * @throws {EsiCredentialError}
   */
  function reacquireEsiAccessToken(characterHash) {
    tokens.delete(characterHash);
    return getEsiAccessToken(characterHash);
  }

  /** The token in hand without acquiring one — for callers that can proceed without it. */
  function heldEsiAccessToken(characterHash, options = {}) {
    return (
      fresh(characterHash, options.minRemainingSec ?? 0)?.accessToken ?? ""
    );
  }

  function forget(characterHash) {
    tokens.delete(characterHash);
    inflight.delete(characterHash);
    forgetCredentialHealth(characterHash);
  }

  function reset() {
    tokens.clear();
    inflight.clear();
    resetCredentialHealth();
  }

  return {
    getEsiAccessToken,
    reacquireEsiAccessToken,
    adoptEsiAccessToken,
    heldEsiAccessToken,
    forget,
    reset,
  };
}

/** Reads the client-held refresh secret for a character out of the account roster. */
function readClientSecret(characterHash) {
  const character = useUsersStore
    .getState()
    .account.characters.find((c) => c?.CharacterHash === characterHash);
  return character?.esiRefreshToken ?? "";
}

/**
 * Writes a client-held refresh secret back. Mutates the roster entry in place rather than going
 * through `set` — a refresh secret is not rendered, and a store write here would undo the
 * render-free property this module exists for. `localStorage["Auth"]` is what a cold reload resumes
 * the main character from, so it travels with the in-memory copy.
 *
 * Exported because a rotation is not the only way a character's secret is replaced: linking a
 * character again hands back a new one, and it has to land in both places or the fix lasts only
 * until the tab is closed.
 *
 * @param {string} characterHash
 * @param {string} secret
 */
export function writeClientSecret(characterHash, secret) {
  const { account } = useUsersStore.getState();
  const character = account.characters.find(
    (c) => c?.CharacterHash === characterHash,
  );
  if (!character) return;
  character.esiRefreshToken = secret;
  if (character.isMainCharacter) {
    try {
      localStorage.setItem("Auth", secret);
    } catch (err) {
      console.error("Failed to persist rotated ESI refresh secret:", err);
    }
  }
}

const clientHeldCredentials = createClientHeldCredentials({
  readSecret: readClientSecret,
  writeSecret: writeClientSecret,
});

const esiCredentials = createEsiCredentialProvider({
  strategy: () =>
    useUsersStore.getState().applicationSettings?.userCloudAccounts
      ? serverStoredCredentials
      : clientHeldCredentials,
});

export default esiCredentials;
export const {
  getEsiAccessToken,
  reacquireEsiAccessToken,
  adoptEsiAccessToken,
  heldEsiAccessToken,
} = esiCredentials;
