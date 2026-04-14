import getCharacterFromRefreshToken from "../../Components/Auth/RefreshToken";
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
            if (useUsersStore.getState().account.characters.some((i) => i.CharacterHash === token.CharacterHash)) continue;
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
 * include tokens for additional characters (not the main character) that were successfully built.
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
            .filter(character => !character.isMainCharacter)
            .map(character => character.CharacterHash)
    );

    // Update tokens with new refresh token values
    for (const character of newUsers) {
        if (character.isMainCharacter) continue;

        const token = tokenMap.get(character.CharacterHash);
        if (token && character.esiRefreshToken !== token.rToken) {
            token.rToken = character.esiRefreshToken;
        }
    }

    // Filter to only include tokens for successfully built additional characters (not main)
    return refreshTokens.filter(
        token => validCharacterHashes.has(token.CharacterHash)
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
            getLocalStorageKey(primaryHash),
            JSON.stringify(tokenArray)
        );
    } catch (err) {
        console.error("Failed to save refresh tokens to localStorage:", err);
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