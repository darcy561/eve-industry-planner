import getUserFromRefreshToken from "../../Components/Auth/RefreshToken";
import { buildCorporationObjectFromUserObject } from "../Corporations/buildCorporationObject";
import { emitUserDataUpdate } from "../../Events/loginEvents";
import useUsersStore from "../../Zustand/usersStore";
import getSystemIndexes from "../System Indexes/findSystemIndex";

function getLocalStorageKey(characterHash) {
    return `${characterHash} AdditionalAccounts`;
}

/**
 * Builds user data from a refresh token.
 * 
 * @param {Object} refreshToken - Refresh token object
 * @returns {Promise<Object>} Promise resolving to user object
 */

export async function buildAccountDataFromRefreshToken(refreshToken) {
    try {
        const user = await getUserFromRefreshToken(refreshToken);
        if (user instanceof Error) {
            throw user;
        }

        await user.getPublicCharacterData();
        await buildCorporationObjectFromUserObject(user);

        emitUserDataUpdate({
            eveLoginComplete: true,
            userArray: [
                {
                    CharacterID: user.CharacterID,
                    CharacterName: user.CharacterName,
                },
            ],
        });

        return user;
    } catch (err) {
        console.error(err);
        return err;
    }
}


export async function buildUsersFromRefreshTokens(userData) {
    const cloudAccountsActive = userData.settings.account.cloudAccounts;
    const refreshTokens = userData.refreshTokens;
    const newUsers = [];
    const userPromises = [];
    try {
        refreshTokens.push(...extractLocalRefreshTokens(userData))

        // Filter out duplicate CharacterHash values, keeping the first occurrence
        const seenHashes = new Set();
        const uniqueRefreshTokens = refreshTokens.filter((token) => {
            if (seenHashes.has(token.CharacterHash)) {
                return false;
            }
            seenHashes.add(token.CharacterHash);
            return true;
        });

        for (let token of uniqueRefreshTokens) {
            if (useUsersStore.getState().users.userArray.some((i) => i.CharacterHash === token.CharacterHash)) continue;
            userPromises.push(buildAccountDataFromRefreshToken(token.rToken));
        }

        const userResults = await Promise.all(userPromises);

        for (let user of userResults) {
            if (user instanceof Error) continue;
            newUsers.push(user);
        }

        if (cloudAccountsActive) {
            userData.refreshTokens = updateCloudRefreshTokens(uniqueRefreshTokens, newUsers);
        } else {
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
 * @param {boolean} userSettings.cloudAccounts - Whether cloud accounts are enabled
 * @returns {Array} Array of refresh token objects, or empty array if cloud accounts enabled or no tokens found
 */
function extractLocalRefreshTokens(userSettings) {
    if (userSettings.cloudAccounts) {
        return [];
    }

    const characterHash = useUsersStore
        .getState()
        .users.actions.findParentUser()?.CharacterHash;

    if (!characterHash) {
        return [];
    }

    const storageKey = getLocalStorageKey(characterHash);

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
 * include tokens for non-parent users that were successfully built.
 * 
 * @param {Array} refreshTokens - Array of refresh token objects with CharacterHash and rToken
 * @param {Array} newUsers - Array of successfully built user objects
 * @returns {Array} Filtered and updated array of refresh tokens
 */
function updateCloudRefreshTokens(refreshTokens, newUsers) {
    // Create a Map for O(1) token lookups by CharacterHash
    const tokenMap = new Map(
        refreshTokens.map(token => [token.CharacterHash, token])
    );

    // Create a Set of valid CharacterHashes for efficient filtering
    const validCharacterHashes = new Set(
        newUsers
            .filter(user => !user.ParentUser)
            .map(user => user.CharacterHash)
    );

    // Update tokens with new refresh token values
    for (const user of newUsers) {
        if (user.ParentUser) continue;

        const token = tokenMap.get(user.CharacterHash);
        if (token && user.rToken !== token.rToken) {
            token.rToken = user.rToken;
        }
    }

    // Filter to only include tokens for successfully built non-parent users
    return refreshTokens.filter(
        token => validCharacterHashes.has(token.CharacterHash)
    );
}


/**
 * Updates localStorage with refresh tokens for additional accounts.
 * 
 * Extracts refresh tokens from successfully built non-parent users and
 * stores them in localStorage for local account management.
 * 
 * @param {Array} newUsers - Array of successfully built user objects
 * @throws {Error} Throws error if parent user hash cannot be found
 */
export function updateLocalRefreshTokens(newUsers) {
    const parentUser = useUsersStore
        .getState()
        .users.actions.findParentUser();

    if (!parentUser?.CharacterHash) {
        console.error("Cannot update local refresh tokens: parent user not found");
        return;
    }

    // Extract tokens from non-parent users
    const tokenArray = newUsers
        .filter(user => !user.ParentUser)
        .map(user => ({
            CharacterHash: user.CharacterHash,
            rToken: user.rToken,
        }));

    try {
        localStorage.setItem(
            getLocalStorageKey(parentUser.CharacterHash),
            JSON.stringify(tokenArray)
        );
    } catch (err) {
        console.error("Failed to save refresh tokens to localStorage:", err);
    }
}

export async function getSystemIndexDataFromUserStructures(fbDocSettings) {
    const manufacturingStructures = fbDocSettings.structures.manufacturing;
    const reactionStructures = fbDocSettings.structures.reaction;

    const requestIDs = new Set(
        [...manufacturingStructures, ...reactionStructures].map(
            (entry) => entry.systemID
        )
    );

    const retrievedSystemIndexes = await getSystemIndexes(requestIDs);

    return retrievedSystemIndexes;
};