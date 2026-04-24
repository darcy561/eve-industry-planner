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
  getApplicationSettingsDocument,
  getUserAccountDocument,
} from "../../Functions/Endpoints/Pirivate/userDocument.js";
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
      if (!characterHash || !rToken) return null;
      return { CharacterHash: characterHash, rToken };
    })
    .filter(Boolean);
}

/**
 * One refresh token per CharacterHash (first row wins when duplicates exist).
 *
 * @param {{ CharacterHash: string, rToken: string }[]} tokens
 * @returns {Map<string, string>}
 */
export function refreshTokenMap(tokens) {
  const grouped = groupRefreshTokensByCharacterHash(tokens);
  const m = new Map();
  for (const [hash, group] of grouped) {
    if (group.rTokens[0]) m.set(hash, group.rTokens[0]);
  }
  return m;
}

/**
 * @param {{ CharacterHash: string, rToken: string }[]} a
 * @param {{ CharacterHash: string, rToken: string }[]} b
 */
export function refreshTokensDiffer(a, b) {
  const ma = refreshTokenMap(a);
  const mb = refreshTokenMap(b);
  if (ma.size !== mb.size) return true;
  for (const [h, r] of ma) {
    if (mb.get(h) !== r) return true;
  }
  return false;
}

/**
 * `local` has strictly more character hashes than `incoming`, and every
 * `incoming` hash is found in `local` (e.g. stale read missing a not-yet-persisted
 * link while this tab’s store already includes it).
 *
 * @param {{ CharacterHash: string, rToken: string }[]} local
 * @param {{ CharacterHash: string, rToken: string }[]} incoming
 */
function hasMoreLinkedCharacterBucketsThan(local, incoming) {
  if (!Array.isArray(local) || !Array.isArray(incoming)) return false;
  const a = new Set(
    local.map((t) => canonicalCharacterHashKey(t.CharacterHash))
  );
  const b = new Set(
    incoming.map((t) => canonicalCharacterHashKey(t.CharacterHash))
  );
  for (const h of b) {
    if (!a.has(h)) return false;
  }
  return a.size > b.size;
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
    account.actions.removeLinkedCharacterRefreshToken(character.CharacterHash);
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
 * }} snap
 * @param {Record<string, unknown>} incomingUserDoc
 */
export async function reconcileAfterRemoteUserDoc(snap, incomingUserDoc) {
  const state = useUsersStore.getState();
  const { account, applicationSettings } = state;
  const accountId = account.accountID;
  if (!accountId) return;
  let cloudNow = !!applicationSettings.userCloudAccounts;
  const mainCharacterHash = account.actions.getMainCharacterHash();
  if (!mainCharacterHash) return;

  const rawIncoming =
    incomingUserDoc.refreshTokens ?? incomingUserDoc.refresh_tokens;
  const incomingTokens = Array.isArray(rawIncoming)
    ? normalizeRefreshTokens(rawIncoming)
    : null;

  /**
   * Race: `users` can arrive before `application_settings` while toggling cloud off.
   * Tokens are already cleared in Mongo but the store still shows cloud on, so an empty
   * token map would delete every additional character. Resolve with authoritative GET.
   */
  if (
    cloudNow &&
    incomingTokens !== null &&
    incomingTokens.length === 0 &&
    snap.prevLinkedTokens.length > 0
  ) {
    const settingsDoc = await getApplicationSettingsDocument();
    if (accountSessionBecameStale(accountId)) {
      return;
    }
    if (!settingsDoc) {
      return;
    }
    const authoritativeCloud = !!settingsDoc.userCloudAccounts;
    if (!authoritativeCloud) {
      const mainHash =
        useUsersStore.getState().account.mainCharacterHash ?? undefined;
      useUsersStore
        .getState()
        .applicationSettings.actions.mergeApplicationSettingsFromServer(
          settingsDoc,
          mainHash
        );
      updateLocalRefreshTokensIfAccountHasAdditionalCharacters();
      if (
        (useUsersStore.getState().account.linkedCharacterRefreshTokens || [])
          .length > 0
      ) {
        useUsersStore.getState().account.actions.setLinkedCharacterRefreshTokens([]);
      }
      return;
    }
    cloudNow = authoritativeCloud;
  }

  if (!cloudNow) {
    const acc = useUsersStore.getState().account;
    updateLocalRefreshTokensIfAccountHasAdditionalCharacters();
    if ((acc.linkedCharacterRefreshTokens || []).length > 0) {
      acc.actions.setLinkedCharacterRefreshTokens([]);
    }
    return;
  }

  if (incomingTokens !== null) {
    if (refreshTokensDiffer(snap.prevLinkedTokens, incomingTokens)) {
      const currentLinked = normalizeRefreshTokens(
        useUsersStore.getState().account.linkedCharacterRefreshTokens
      );
      if (
        isCombinedUserAccountSaveDebouncePending() &&
        hasMoreLinkedCharacterBucketsThan(currentLinked, incomingTokens)
      ) {
        // GET / resync or WS can carry a document written before a local
        // "link additional account" is persisted (2s debounce). Do not
        // overwrite with a missing linked character.
      } else {
        account.actions.setLinkedCharacterRefreshTokens(incomingTokens);
      }
    }
  }

  const effective = normalizeRefreshTokens(
    useUsersStore.getState().account.linkedCharacterRefreshTokens
  );
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
  const state = useUsersStore.getState();
  const { account, applicationSettings } = state;
  const accountId = account.accountID;
  if (!accountId) return;
  const cloudNow = !!applicationSettings.userCloudAccounts;
  const mainCharacterHash = account.actions.getMainCharacterHash();
  if (!mainCharacterHash) return;

  if (prevCloudAccounts !== cloudNow) {
    if (!cloudNow) {
      const acc = useUsersStore.getState().account;
      updateLocalRefreshTokensIfAccountHasAdditionalCharacters();
      if ((acc.linkedCharacterRefreshTokens || []).length > 0) {
        acc.actions.setLinkedCharacterRefreshTokens([]);
      }
    } else {
      /** Match Additional Accounts UI: migrate off local-only storage before linked tokens apply. */
      clearLocalAdditionalAccountsStorage();

      /**
       * Race: `application_settings` can arrive before `users` while turning cloud on.
       * Linked tokens are still empty → an empty token map deletes every additional
       * character. Pull tokens from the API once; if still empty, skip destructive
       * reconcile until the `users` websocket doc lands.
       */
      let effective = normalizeRefreshTokens(account.linkedCharacterRefreshTokens);
      if (effective.length === 0) {
        const userDoc = await getUserAccountDocument();
        if (accountSessionBecameStale(accountId)) {
          return;
        }
        const rawRt = userDoc?.refreshTokens ?? userDoc?.refresh_tokens;
        if (Array.isArray(rawRt) && rawRt.length > 0) {
          const normalized = normalizeRefreshTokens(rawRt);
          account.actions.setLinkedCharacterRefreshTokens(normalized);
          effective = normalized;
        }
      }
      const tokenCandidatesByHash =
        groupRefreshTokensByCharacterHash(effective);
      if (tokenCandidatesByHash.size === 0) {
        scheduleSystemIndexRefresh();
        return;
      }
      await reconcileCloudCharactersFromTokenMap(tokenCandidatesByHash);
    }
  }

  scheduleSystemIndexRefresh();
}
