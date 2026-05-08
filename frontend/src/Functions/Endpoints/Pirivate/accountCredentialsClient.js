import requestWithPrivateHeaders from "./applyPrivateHeaders.js";

const USER_LINKED_CHARACTERS_OAUTH_CREDENTIALS =
  "/api/v1/user/linked-characters/oauth-credentials";

/**
 * GET linked character hashes (no refresh secrets).
 */
export async function getLinkedCharacterOAuthHashes() {
  return requestWithPrivateHeaders(
    USER_LINKED_CHARACTERS_OAUTH_CREDENTIALS,
    { method: "GET", credentials: "same-origin" },
    { requestName: "getLinkedCharacterOAuthHashes" }
  );
}

/**
 * PUT encrypted OAuth rows for server-linked characters.
 */
export async function putLinkedCharacterOAuthCredentials(body) {
  return requestWithPrivateHeaders(
    USER_LINKED_CHARACTERS_OAUTH_CREDENTIALS,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { requestName: "putLinkedCharacterOAuthCredentials" }
  );
}

/**
 * DELETE OAuth rows by character hashes.
 */
export async function deleteLinkedCharacterOAuthCredentials(body) {
  return requestWithPrivateHeaders(
    USER_LINKED_CHARACTERS_OAUTH_CREDENTIALS,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { requestName: "deleteLinkedCharacterOAuthCredentials" }
  );
}
