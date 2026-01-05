/**
 * Fetches a server JWT token using an EVE SSO token.
 * 
 * This function authenticates with the server by exchanging an EVE Online SSO token
 * for a server-issued JWT token. The server JWT is used for authenticated API requests.
 * 
 * @param {string} eveSSOToken - The EVE Online SSO token obtained from EVE's authentication service
 * @returns {Promise<Object>} Promise that resolves to an object containing:
 *   @property {string} access_token - The server JWT access token
 *   @property {string} refresh_token - The refresh token for obtaining new access tokens
 *   @property {number} expires_at - Token expiration time as Unix timestamp (seconds since epoch)
 * @throws {Error} Throws an error if the request fails or the response is not OK
 * 
 * @example
 * const tokenData = await fetchServerJWT(eveSSOToken);
 * console.log(tokenData.access_token); // Use this token for authenticated requests
 */
export async function fetchServerJWT(eveSSOToken) {
    try {
        const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: eveSSOToken
            })
        })
        if (!response.ok) {
            throw new Error(`Failed to fetch server JWT: ${response.status} ${response.statusText}`)
        }
        return response.json()
    } catch (err) {
        // Re-throw if it's already an Error we created, otherwise wrap it
        if (err instanceof Error && err.message.startsWith('Failed to fetch server JWT')) {
            throw err
        }
        throw new Error(`Error fetching server JWT: ${err.message}`)
    }
}

/**
 * Refreshes a server JWT token using a refresh token and EVE SSO token.
 * 
 * This function obtains a new server JWT access token using a previously issued
 * refresh token. The EVE SSO token must match the one originally used to obtain
 * the refresh token.
 * 
 * @param {string} refreshToken - The refresh token obtained from a previous authentication
 * @param {string} eveSSOToken - The EVE Online SSO token (must match the original token used)
 * @returns {Promise<Object>} Promise that resolves to an object containing:
 *   @property {string} access_token - The new server JWT access token
 *   @property {string} refresh_token - The new refresh token (may be rotated)
 *   @property {number} expires_at - Token expiration time as Unix timestamp (seconds since epoch)
 * @throws {Error} Throws an error if the request fails, the response is not OK, or tokens are invalid
 * 
 * @example
 * const newTokenData = await refreshServerJWT(refreshToken, eveSSOToken);
 * console.log(newTokenData.access_token); // Use this new token for authenticated requests
 */
export async function refreshServerJWT(refreshToken, eveSSOToken) {
    try {
        const response = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refresh_token: refreshToken,
                eve_token: eveSSOToken
            })
        })

        if (!response.ok) {
            throw new Error(`Failed to refresh server JWT: ${response.status} ${response.statusText}`)
        }

        return await response.json()
    }
    catch (err) {
        if (err instanceof Error && err.message.startsWith('Failed to refresh server JWT')) {
            throw err
        }
        throw new Error(`Error refreshing server JWT: ${err.message}`)
    }
}

