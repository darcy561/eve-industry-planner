import requestWithPrivateHeaders from "./applyPrivateHeaders.js";
import useUsersStore from "../../../Zustand/usersStore";

const USER_DOCUMENT_URL = "/api/v1/user/main";

/**
 * Saves user document to MongoDB via backend API.
 * 
 * Combines application settings and user data into a single document
 * and sends it to the backend for persistence. The backend will:
 * - Extract accountID from JWT token
 * - Validate and merge the document
 * - Upsert to MongoDB
 * 
 * @returns {Promise<boolean>} Promise that resolves to true if successful, false if failed
 * 
 * @throws {Error} Throws error if authentication fails or request fails
 * 
 * @example
 * // Save user document
 * const success = await saveUserDocument();
 * if (success) {
 *   console.log("User document saved successfully");
 * }
 */
async function saveUserDocument() {
    try {
        // Get current state from Zustand store
        const settings = useUsersStore
            .getState()
            .applicationSettings.actions.toDocument();
        const userData = useUsersStore.getState().users.actions.toDocument();

        // Combine settings and user data into user document structure
        const userDocument = {
            settings,
            ...userData,
        };

        // Make PUT request with authentication
        const response = await requestWithPrivateHeaders(
            USER_DOCUMENT_URL,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(userDocument),
            },
            { requestName: "saveUserDocument" }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                `Failed to save user document: ${response.status} ${response.statusText}`,
                errorText
            );
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error saving user document:", error);
        return false;
    }
}

/**
 * Retrieves user document from MongoDB via backend API.
 * 
 * Fetches the complete user document including settings, refresh tokens,
 * job status array, and linked ESI data. The backend will:
 * - Extract accountID from JWT token
 * - Query MongoDB for user document
 * - Return complete document or 404 if not found
 * 
 * @returns {Promise<Object|null>} Promise that resolves to user document object or null if failed/not found
 * 
 * @throws {Error} Throws error if authentication fails or request fails
 * 
 * @example
 * // Get user document
 * const userDoc = await getUserDocument();
 * if (userDoc) {
 *   console.log("User document retrieved:", userDoc.settings);
 * }
 */
async function getUserDocument() {
    try {
        // Make GET request with authentication
        const response = await requestWithPrivateHeaders(
            USER_DOCUMENT_URL,
            {
                method: "GET",
            },
            { requestName: "getUserDocument" }
        );

        if (!response.ok) {
            if (response.status === 404) {
                console.warn("User document not found");
                return null;
            }
            const errorText = await response.text();
            console.error(
                `Failed to get user document: ${response.status} ${response.statusText}`,
                errorText
            );
            return null;
        }

        const userDocument = await response.json();
        return userDocument;
    } catch (error) {
        console.error("Error getting user document:", error);
        return null;
    }
}

export { saveUserDocument, getUserDocument };
