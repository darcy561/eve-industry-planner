import requestWithPrivateHeaders from "./applyPrivateHeaders.js";
import useUsersStore from "../../../Zustand/usersStore";

const USER_MAIN_URL = "/api/v1/user/document";
const APPLICATION_SETTINGS_URL = "/api/v1/user/application-settings";

/**
 * Saves user account document (linked ESI IDs, refresh tokens) to Mongo via PUT `/api/v1/user/main`.
 *
 * @returns {Promise<boolean>}
 */
async function saveUserAccountDocument() {
  try {
    const userData = {
      ...useUsersStore.getState().account.actions.linkedEsiToDocument(),
    };

    const response = await requestWithPrivateHeaders(
      USER_MAIN_URL,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      },
      { requestName: "saveUserAccountDocument" }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to save user account document: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error saving user account document:", error);
    return false;
  }
}

/**
 * Saves application settings to Mongo via PUT `/api/v1/user/application-settings`.
 *
 * @returns {Promise<boolean>}
 */
async function saveApplicationSettings() {
  try {
    const body = useUsersStore
      .getState()
      .applicationSettings.actions.toPersistPayload();

    const response = await requestWithPrivateHeaders(
      APPLICATION_SETTINGS_URL,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      { requestName: "saveApplicationSettings" }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to save application settings: ${response.status} ${response.statusText}`,
        errorText
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error saving application settings:", error);
    return false;
  }
}

/**
 * Persists both account and application settings (e.g. when both slices may have changed).
 *
 * @returns {Promise<boolean>} true if both succeed
 */
async function saveUserAccountAndApplicationSettings() {
  const [a, b] = await Promise.all([
    saveUserAccountDocument(),
    saveApplicationSettings(),
  ]);
  return a && b;
}

/**
 * Loads user account document from Mongo via GET `/api/v1/user/main`.
 *
 * @returns {Promise<Object|null>}
 */
async function getUserAccountDocument() {
  try {
    const response = await requestWithPrivateHeaders(
      USER_MAIN_URL,
      {
        method: "GET",
        cache: "no-store",
      },
      { requestName: "getUserAccountDocument" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.warn("User account document not found");
        return null;
      }
      const errorText = await response.text();
      console.error(
        `Failed to get user account document: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error getting user account document:", error);
    return null;
  }
}

/**
 * Loads application settings from Mongo via GET `/api/v1/user/application-settings`.
 *
 * @returns {Promise<Object|null>}
 */
async function getApplicationSettingsDocument() {
  try {
    const response = await requestWithPrivateHeaders(
      APPLICATION_SETTINGS_URL,
      {
        method: "GET",
        cache: "no-store",
      },
      { requestName: "getApplicationSettingsDocument" }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.warn("Application settings document not found");
        return null;
      }
      const errorText = await response.text();
      console.error(
        `Failed to get application settings: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error getting application settings document:", error);
    return null;
  }
}

export {
  saveUserAccountDocument,
  saveApplicationSettings,
  saveUserAccountAndApplicationSettings,
  getUserAccountDocument,
  getApplicationSettingsDocument,
};
