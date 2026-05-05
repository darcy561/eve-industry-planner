/**
 * Shared realtime reconcile helpers for account-scoped documents (`users`,
 * `application_settings`): refresh tokens, Character models, system indexes.
 */

import useUsersStore from "../../Zustand/usersStore.js";
import {
  buildAccountDataFromRefreshTokenCandidates,
  canonicalCharacterHashKey,
  clearLocalAdditionalAccountsStorage,
  getSystemIndexDataFromUserStructures,
  groupRefreshTokensByCharacterHash,
  updateLocalRefreshTokens,
  updateLocalRefreshTokensIfAccountHasAdditionalCharacters,
} from "../../Functions/Auth/buildAccountData.js";
import {
  getCloudStoredEsiRefreshTokens,
} from "../../Functions/Endpoints/Pirivate/cloudStoredEsiRefreshTokens.js";
import { isCombinedUserAccountSaveDebouncePending } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";

/**
 * After async work, drop writes if the client no longer has the same account session
 * (e.g. user signed out while a GET or ESI call was in flight).
 *
 * @param {string | null | undefined} accountIdAtStart
 * @returns {boolean}
 */
function accountSessionBecameStale(accountIdAtStart) {
  if (accountIdAtStart == null || accountIdAtStart === "") return true;
  return useUsersStore.getState().account.accountID !== accountIdAtStart;
}

/** @type {Promise<void>} */
let reconcileQueue = Promise.resolve();
let systemIndexRefreshTimer = null;

/**
 * @param {unknown} raw
 * @returns {{ CharacterHash: string, rToken: string }[]}
 */
export function normalizeRefreshTokens(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((token) => {
      if (!token || typeof token !== "object") return null;
      const row = /** @type {Record<string, unknown>} */ (token);
      const characterHash =
        typeof row.CharacterHash === "string"
          ? row.CharacterHash
          : typeof row.characterHash === "string"
            ? row.characterHash
            : "";
      const rToken = typeof row.rToken === "string" ? row.rToken : "";
      if (!characterHash) return null;
      // Allow empty rToken for server-managed cloud rows (hash-only transport over WS/HTTP).
      return { CharacterHash: characterHash, rToken };
    })
    .filter(Boolean);
}

/**
 * @param {() => Promise<void>} task
 */
export function enqueueReconcile(task) {
  reconcileQueue = reconcileQueue
    .then(task)
    .catch((error) =>
      console.error("[realtime] account reconcile failed", error)
    );
}

async function refreshSystemIndexesFromSettings() {
  const accountIdAtStart = useUsersStore.getState().account.accountID;
  if (accountIdAtStart == null) return;

  const settings = useUsersStore.getState().applicationSettings;
  const systemIndexes = await getSystemIndexDataFromUserStructures(settings);
  if (accountSessionBecameStale(accountIdAtStart)) {
    return;
  }
  if (systemIndexes && Object.keys(systemIndexes).length > 0) {
    useUsersStore.getState().worldData.actions.addSystemIndex(systemIndexes);
  }
}

  export function scheduleSystemIndexRefresh() {
    if (systemIndexRefreshTimer != null) {
      clearTimeout(systemIndexRefreshTimer);
    }
    systemIndexRefreshTimer = window.setTimeout(() => {
      systemIndexRefreshTimer = null;
      enqueueReconcile(refreshSystemIndexesFromSettings);
    }, 250);
  }

/**
 * @param {Map<string, { rTokens: string[], representativeCharacterHash: string }>} tokenByHash
 */
function syncExistingCharacterRefreshTokens(tokenByHash) {
  if (tokenByHash.size === 0) return;

  const { account } = useUsersStore.getState();
  let changed = false;

  for (const ch of account.characters) {
    if (!ch?.CharacterHash) continue;
    const key = canonicalCharacterHashKey(ch.CharacterHash);
    const group = tokenByHash.get(key);
    const nextRt = group?.rTokens?.[0];
    if (!nextRt || ch.esiRefreshToken === nextRt) continue;
    ch.esiRefreshToken = nextRt;
    changed = true;
  }

  if (changed) {
    useUsersStore
      .getState()
      .account.actions.updateCharacters([
        ...useUsersStore.getState().account.characters,
      ]);
  }
}

/**
 * @param {ReturnType<typeof groupRefreshTokensByCharacterHash>} tokenCandidatesByHash
 */
async function reconcileCloudCharactersFromTokenMap(tokenCandidatesByHash) {
  const accountIdAtStart = useUsersStore.getState().account.accountID;
  if (accountIdAtStart == null) return;

  syncExistingCharacterRefreshTokens(tokenCandidatesByHash);

  const account = useUsersStore.getState().account;
  const targetHashes = new Set(tokenCandidatesByHash.keys());
  const additionalCharacters = account.characters.filter((ch) => !ch.isMainCharacter);

  for (const character of additionalCharacters) {
    if (
      targetHashes.has(canonicalCharacterHashKey(character.CharacterHash))
    ) {
      continue;
    }
    account.actions.removeCharacter(character);
    account.actions.removeCharacterFromCorporations(character.CharacterHash);
  }

  const existingHashes = new Set(
    useUsersStore
      .getState()
      .account.characters.map((ch) =>
        canonicalCharacterHashKey(ch.CharacterHash)
      )
  );
  for (const [canonicalHash, group] of tokenCandidatesByHash.entries()) {
    if (existingHashes.has(canonicalHash)) continue;
    const built = await buildAccountDataFromRefreshTokenCandidates(
      group.rTokens
    );
    if (accountSessionBecameStale(accountIdAtStart)) {
      return;
    }
    if (!built) continue;
    useUsersStore.getState().account.actions.addCharacter(built);
    existingHashes.add(canonicalCharacterHashKey(built.CharacterHash));
  }
}

/**
 * @param {{
 *   prevLinkedTokens: { CharacterHash: string, rToken: string }[],
 *   refreshTokensChanged?: boolean,
 *   linkedCharactersChanged?: boolean,
 * }} snap
 * @param {Record<string, unknown>} incomingUserDoc
 */
export async function reconcileAfterRemoteUserDoc(snap, incomingUserDoc) {
  const state = useUsersStore.getState();
  const { account, applicationSettings } = state;
  const accountId = account.accountID;
  if (!accountId) return;
  const cloudFlagFromDoc =
    incomingUserDoc?.userCloudAccounts ?? incomingUserDoc?.user_cloud_accounts;
  let cloudNow =
    cloudFlagFromDoc === undefined
      ? !!applicationSettings.userCloudAccounts
      : !!cloudFlagFromDoc;
  const mainCharacterHash = account.actions.getMainCharacterHash();
  if (!mainCharacterHash) return;

  const rawIncoming =
    incomingUserDoc.refreshTokens ?? incomingUserDoc.refresh_tokens;
  const incomingTokens = Array.isArray(rawIncoming)
    ? normalizeRefreshTokens(rawIncoming)
    : null;

  if (!cloudNow) {
    updateLocalRefreshTokensIfAccountHasAdditionalCharacters();
    return;
  }

  const linkedCharactersMayHaveChanged =
    !!snap?.linkedCharactersChanged || !!snap?.refreshTokensChanged;
  let effective = incomingTokens ?? [];
  const hasUsableRefreshTokenMaterial = effective.some(
    (row) => !!row?.rToken && row.rToken.trim().length > 0
  );
  if (
    (effective.length === 0 || !hasUsableRefreshTokenMaterial) &&
    linkedCharactersMayHaveChanged
  ) {
    // Main user doc no longer carries cloud-stored ESI refresh rows (dedicated endpoint instead).
    const tokenDoc = await getCloudStoredEsiRefreshTokens();
    if (accountSessionBecameStale(accountId)) {
      return;
    }
    const rawRt = tokenDoc?.refreshTokens;
    effective = Array.isArray(rawRt) ? normalizeRefreshTokens(rawRt) : [];
  }
  if (effective.length === 0 && !linkedCharactersMayHaveChanged) {
    // No linked-character signal and no token payload means this users-doc update
    // is unrelated to additional accounts; keep the current character list.
    return;
  }

  if (
    isCombinedUserAccountSaveDebouncePending() &&
    effective.length === 0 &&
    snap.prevLinkedTokens.length > 0
  ) {
    return;
  }

  const tokenCandidatesByHash = groupRefreshTokensByCharacterHash(effective);
  await reconcileCloudCharactersFromTokenMap(tokenCandidatesByHash);
  if (accountSessionBecameStale(accountId)) {
    return;
  }
}

/**
 * @param {boolean} prevCloudAccounts
 */
export async function reconcileAfterRemoteApplicationSettings(prevCloudAccounts) {
  void prevCloudAccounts;
  scheduleSystemIndexRefresh();
}
