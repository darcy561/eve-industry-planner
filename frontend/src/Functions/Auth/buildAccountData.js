import { decodeJwt } from "jose";
import Character from "../../Classes/character";
import getCharacterFromRefreshToken from "../../Components/Auth/RefreshToken";
import refreshCloudStoredEsiAccessToken from "../EveESI/Character/refreshCloudStoredEsiAccessToken.js";
import { canonicalCharacterHashKey } from "./characterHashCanonical.js";
import { buildCorporationObjectFromUserObject } from "../Corporations/buildCorporationObject";
import { emitUserDataUpdate } from "../../Events/loginEvents";
import useUsersStore from "../../Zustand/usersStore";
import getSystemIndexes from "../System Indexes/findSystemIndex";

export { canonicalCharacterHashKey };

/**
 * Hydrates additional `Character` rows from server-issued ESI access sessions (cloud mode login).
 *
 * @param {{ characterHash?: string, CharacterHash?: string, access_token: string, token_type?: string, expires_in?: number }[]} linkedCharacters
 * @returns {Promise<import("../../Classes/character").default[]>}
 */
export async function hydrateLinkedCharactersFromAccessSessions(
  linkedCharacters
) {
  const out = [];
  if (!Array.isArray(linkedCharacters)) return out;
  for (const s of linkedCharacters) {
    const hash = s.characterHash ?? s.CharacterHash;
    if (!s?.access_token || !hash) continue;
    try {
      const jwtPayload = decodeJwt(s.access_token);
      const ch = new Character({
        jwtPayload,
        tokenResponse: { access_token: s.access_token, refresh_token: "" },
        isMainCharacter: false,
      });
      await ch.getPublicCharacterData();
      await buildCorporationObjectFromUserObject(ch);
      // Keep login progress UI behavior consistent with refresh-token hydration:
      // surface each linked character as it finishes loading.
      emitUserDataUpdate({
        eveLoginComplete: true,
        userArray: [
          {
            CharacterID: ch.CharacterID,
            CharacterName: ch.CharacterName,
          },
        ],
      });
      out.push(ch);
    } catch (e) {
      console.error(e);
    }
  }
  return out;
}

/**
 * `localStorage` key for per-main-character additional-account refresh token JSON.
 * @param {string} mainCharacterHash
 */
export function getLocalAdditionalAccountsStorageKey(mainCharacterHash) {
    return `${mainCharacterHash} AdditionalAccounts`;
}

/**
 * Builds user data from a refresh token.
 * 
 * @param {Object} refreshToken - Refresh token object
 * @returns {Promise<Object>} Promise resolving to user object
 */

export async function buildAccountDataFromRefreshToken(refreshToken) {
    try {
        const character = await getCharacterFromRefreshToken(refreshToken);
        if (character instanceof Error) {
            throw character;
        }

        await character.getPublicCharacterData();
        await buildCorporationObjectFromUserObject(character);

        emitUserDataUpdate({
            eveLoginComplete: true,
            userArray: [
                {
                    CharacterID: character.CharacterID,
                    CharacterName: character.CharacterName,
                },
            ],
        });

        return character;
    } catch (err) {
        console.error(err);
        return err;
    }
}

/** @param {string[]} strings */
function orderedUniqueStrings(strings) {
    const seen = new Set();
    const out = [];
    for (const s of strings) {
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}

/**
 * Groups refresh token rows by canonical CharacterHash (case-insensitive). Order is preserved;
 * duplicate rToken strings for the same character are collapsed while keeping first-seen order.
 *
 * Map keys are canonical (`canonicalCharacterHashKey`). `representativeCharacterHash` is the
 * first-seen raw hash string for persistence rows (Mongo/local).
 *
 * @param {{ CharacterHash: string, rToken: string }[]} tokens
 * @returns {Map<string, { rTokens: string[], representativeCharacterHash: string }>}
 */
export function groupRefreshTokensByCharacterHash(tokens) {
    const pending = new Map();
    for (const t of tokens) {
        if (!t?.CharacterHash) continue;
        const key = canonicalCharacterHashKey(t.CharacterHash);
        if (!key) continue;
        if (!pending.has(key)) {
            pending.set(key, {
                rTokens: [],
                representativeCharacterHash: t.CharacterHash,
            });
        }
        const rTok = typeof t.rToken === "string" ? t.rToken.trim() : "";
        if (rTok) {
            pending.get(key).rTokens.push(rTok);
        }
    }
    const result = new Map();
    for (const [key, entry] of pending) {
        result.set(key, {
            rTokens: orderedUniqueStrings(entry.rTokens),
            representativeCharacterHash: entry.representativeCharacterHash,
        });
    }
    return result;
}

/**
 * Tries refresh tokens in order until one successfully builds a Character (ESI refresh + data load).
 *
 * @param {string[]} rTokens
 * @returns {Promise<import("../../Classes/character").default | null>}
 */
export async function buildAccountDataFromRefreshTokenCandidates(rTokens) {
    if (!Array.isArray(rTokens) || rTokens.length === 0) return null;
    for (const rToken of rTokens) {
        const user = await buildAccountDataFromRefreshToken(rToken);
        if (!(user instanceof Error)) return user;
    }
    return null;
}

/**
 * Hydrates a linked (non-main) character in cloud mode using server-held OAuth refresh only.
 * No ESI refresh token is kept on the client.
 *
 * @param {string} characterHash
 * @returns {Promise<import("../../Classes/character").default | null>}
 */
export async function buildCharacterFromCloudStoredAccess(characterHash) {
    const hash = typeof characterHash === "string" ? characterHash.trim() : "";
    if (!hash) return null;
    const tok = await refreshCloudStoredEsiAccessToken(hash);
    if (tok instanceof Error || !tok?.access_token) {
        console.warn("Cloud-stored ESI access failed for linked character", hash, tok);
        return null;
    }
    try {
        const jwtPayload = decodeJwt(tok.access_token);
        const ch = new Character({
            jwtPayload,
            tokenResponse: {
                access_token: tok.access_token,
                token_type: tok.token_type,
                expires_in: tok.expires_in,
                refresh_token: "",
            },
            isMainCharacter: false,
        });
        await ch.getPublicCharacterData();
        await buildCorporationObjectFromUserObject(ch);
        return ch;
    } catch (e) {
        console.error(e);
        return null;
    }
}

export async function buildUsersFromRefreshTokens(userData) {
    const cloudAccountsActive =
        userData.settings?.userCloudAccounts ??
        userData.userCloudAccounts ??
        false;
    // Normalize refreshTokens from database (characterHash -> CharacterHash) for internal use
    const refreshTokens = (userData.refreshTokens || []).map(token => ({
        CharacterHash: token.CharacterHash || token.characterHash,
        rToken: token.rToken,
    }));
    const newUsers = [];
    try {
        refreshTokens.push(...extractLocalRefreshTokens(userData));

        const groups = groupRefreshTokensByCharacterHash(refreshTokens);
        const existingCharacters = useUsersStore.getState().account.characters;
        const existingHashes = new Set(
            existingCharacters.map((c) =>
                canonicalCharacterHashKey(c.CharacterHash)
            )
        );

        const buildTasks = [];
        for (const [canonicalHash, group] of groups) {
            if (existingHashes.has(canonicalHash)) continue;
            if (
                cloudAccountsActive &&
                (!group.rTokens || group.rTokens.length === 0)
            ) {
                buildTasks.push(
                    buildCharacterFromCloudStoredAccess(
                        group.representativeCharacterHash
                    )
                );
            } else {
                buildTasks.push(
                    buildAccountDataFromRefreshTokenCandidates(group.rTokens)
                );
            }
        }

        const userResults = await Promise.all(buildTasks);

        const seenBuiltHashes = new Set();
        for (const user of userResults) {
            if (!user || user instanceof Error) continue;
            const canon = canonicalCharacterHashKey(user.CharacterHash);
            if (!canon || seenBuiltHashes.has(canon)) continue;
            seenBuiltHashes.add(canon);
            newUsers.push(user);
        }

        const canonicalRefreshTokens = [...groups.entries()].map(
            ([, group]) => ({
                CharacterHash: group.representativeCharacterHash,
                rToken: group.rTokens[0] ?? "",
            })
        ).filter((row) => row.rToken);

        if (cloudAccountsActive) {
            userData.refreshTokens = updateCloudRefreshTokens(
                canonicalRefreshTokens,
                newUsers
            );
        } else if (newUsers.length > 0) {
            updateLocalRefreshTokens(newUsers);
        }

        return newUsers;

    } catch (err) {
        console.error(err);
        return newUsers;
    }
}

/**
 * Extracts refresh tokens from localStorage for additional accounts.
 * 
 * @param {Object} userSettings - User settings object
 * @param {boolean} [userSettings.userCloudAccounts] - Whether cloud accounts are enabled
 * @returns {Array} Array of refresh token objects, or empty array if cloud accounts enabled or no tokens found
 */
function extractLocalRefreshTokens(userSettings) {
    if (
        userSettings.userCloudAccounts ??
        userSettings.settings?.userCloudAccounts
    ) {
        return [];
    }

    const characterHash = useUsersStore
        .getState()
        .account.actions.getMainCharacterHash();

    if (!characterHash) {
        return [];
    }

    const storageKey = getLocalAdditionalAccountsStorageKey(characterHash);

    try {
        const storedAccounts = localStorage.getItem(storageKey);
        if (!storedAccounts) {
            return [];
        }

        const rTokens = JSON.parse(storedAccounts);
        return Array.isArray(rTokens) ? rTokens : [];
    } catch (err) {
        // Reset corrupted data
        localStorage.setItem(storageKey, JSON.stringify([]));
        console.warn("Failed to parse stored accounts:", err);
        return [];
    }
}

/**
 * Updates and filters cloud refresh tokens based on successfully built users.
 * 
 * Updates refresh tokens with new token values from users and filters to only
 * include tokens for additional characters (not the main character) that were successfully built.
 * 
 * @param {Array} refreshTokens - Array of refresh token objects with CharacterHash and rToken
 * @param {Array} newUsers - Array of successfully built user objects
 * @returns {Array} Filtered and updated array of refresh tokens
 */
function updateCloudRefreshTokens(refreshTokens, newUsers) {
    const tokenMap = new Map(
        refreshTokens.map((token) => [
            canonicalCharacterHashKey(token.CharacterHash),
            token,
        ])
    );

    const validCanonicalHashes = new Set(
        newUsers
            .filter((character) => !character.isMainCharacter)
            .map((character) =>
                canonicalCharacterHashKey(character.CharacterHash)
            )
    );

    for (const character of newUsers) {
        if (character.isMainCharacter) continue;

        const token = tokenMap.get(
            canonicalCharacterHashKey(character.CharacterHash)
        );
        if (token && character.esiRefreshToken !== token.rToken) {
            token.rToken = character.esiRefreshToken;
        }
    }

    return refreshTokens.filter((token) =>
        validCanonicalHashes.has(
            canonicalCharacterHashKey(token.CharacterHash)
        )
    );
}

/**
 * Updates localStorage with refresh tokens for additional accounts.
 * 
 * Extracts refresh tokens from successfully built additional characters (not main) and
 * stores them in localStorage for local account management.
 * 
 * @param {Array} newUsers - Array of successfully built user objects
 */
export function updateLocalRefreshTokens(newUsers) {
    const primaryHash = useUsersStore
        .getState()
        .account.actions.getMainCharacterHash();

    if (!primaryHash) {
        console.error("Cannot update local refresh tokens: main character hash not found");
        return;
    }

    // Extract tokens from additional characters (not main)
    const tokenArray = newUsers
        .filter(character => !character.isMainCharacter)
        .map(character => ({
            CharacterHash: character.CharacterHash,
            rToken: character.esiRefreshToken,
        }));

    try {
        localStorage.setItem(
            getLocalAdditionalAccountsStorageKey(primaryHash),
            JSON.stringify(tokenArray)
        );
    } catch (err) {
        console.error("Failed to save refresh tokens to localStorage:", err);
    }
}

/**
 * Persists linked alts to `${mainHash} AdditionalAccounts` from the current Zustand
 * `account.characters` list. **No-ops** when the store has no non-main rows so we do
 * not write `[]` while the list is still main-only (e.g. a users-doc reconcile or
 * settings event before `runPostLoginAccountSync` has finished building alts).
 */
export function updateLocalRefreshTokensIfAccountHasAdditionalCharacters() {
    const characters = useUsersStore.getState().account.characters;
    if (!characters.some((c) => c && !c.isMainCharacter)) {
        return;
    }
    updateLocalRefreshTokens(characters);
}

/**
 * Removes `${mainCharacterHash} AdditionalAccounts` from localStorage (same key as
 * Additional Accounts toggle when switching to cloud — avoids duplicate/stale local copies).
 */
export function clearLocalAdditionalAccountsStorage() {
    if (typeof localStorage === "undefined") return;
    const primaryHash = useUsersStore
        .getState()
        .account.actions.getMainCharacterHash();
    if (!primaryHash) return;
    try {
        localStorage.removeItem(getLocalAdditionalAccountsStorageKey(primaryHash));
    } catch (err) {
        console.warn("Failed to clear additional accounts localStorage:", err);
    }
}

export async function getSystemIndexDataFromUserStructures(settings) {
    const cs = settings.customStructures || settings.structures;
    const manufacturingStructures = cs?.manufacturing ?? [];
    const reactionStructures = cs?.reaction ?? [];

    const requestIDs = new Set(
        [...manufacturingStructures, ...reactionStructures].map(
            (entry) => entry.systemID
        )
    );

    const retrievedSystemIndexes = await getSystemIndexes(requestIDs);

    return retrievedSystemIndexes;
};