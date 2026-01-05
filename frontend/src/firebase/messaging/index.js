import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { messaging } from "../../firebase.js";

/**
 * Initializes Firebase Cloud Messaging and gets a reference to the service.
 * 
 * This function initializes Firebase Cloud Messaging (FCM) for the application:
 * - Sets up messaging service for push notifications
 * - Enables background and foreground message handling
 * - Provides foundation for push notification functionality
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @returns {import('firebase/messaging').Messaging} The initialized Messaging instance
 * 
 * @example
 * const messaging = initializeMessaging(firebaseApp);
 * console.log('Firebase Cloud Messaging initialized');
 */
export const initializeMessaging = (app) => {
    return getMessaging(app);
};

/**
 * Gets the Firebase Cloud Messaging registration token for push notifications.
 * 
 * This function retrieves the FCM registration token needed for push notifications:
 * - Generates a unique token for the current browser/device
 * - Uses VAPID key for secure token generation
 * - Handles token retrieval errors gracefully
 * - Returns null if token generation fails
 * 
 * The token retrieval process:
 * 1. Attempts to get token using Firebase messaging service
 * 2. Uses VAPID key from environment variables for security
 * 3. Logs successful token retrieval
 * 4. Handles errors and returns null on failure
 * 
 * @returns {Promise<string|null>} Promise that resolves to the registration token or null
 * 
 * @example
 * const token = await getRegistrationToken();
 * if (token) {
 *   console.log('Registration token:', token);
 *   // Send token to server for push notification setup
 * } else {
 *   console.log('Failed to get registration token');
 * }
 */
export const getRegistrationToken = async () => {
  if (!messaging) {
    console.warn("Messaging service not available");
    return null;
  }
  
  try {
    const token = await getToken(messaging, {
      vapidKey: (typeof window !== 'undefined' && window.env?.FIREBASE_VAPID_KEY) ||
                (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.FIREBASE_VAPID_KEY) || 
                (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.VITE_fbVapidKey) || 
                import.meta.env.VITE_fbVapidKey,
    });
    
    if (token) {
      console.log("Registration token:", token);
      return token;
    } else {
      console.log("No registration token available.");
      return null;
    }
  } catch (err) {
    console.error("An error occurred while retrieving token:", err);
    return null;
  }
};

/**
 * Sets up a listener for foreground Firebase Cloud Messaging messages.
 * 
 * This function handles push notifications when the app is in the foreground:
 * - Listens for incoming FCM messages while app is active
 * - Executes callback function when message is received
 * - Provides access to message payload and notification data
 * - Returns unsubscribe function to stop listening
 * 
 * The message handling process:
 * 1. Sets up listener for foreground messages
 * 2. Executes callback with message data when received
 * 3. Provides unsubscribe function for cleanup
 * 
 * @param {Function} callback - Callback function to execute when message is received
 * @param {Object} callback.message - The FCM message object
 * @param {Object} callback.message.notification - Notification data (title, body, etc.)
 * @param {Object} callback.message.data - Custom data payload
 * @returns {Function} Unsubscribe function to stop listening for messages
 * 
 * @example
 * const unsubscribe = onForegroundMessage((message) => {
 *   console.log('Received foreground message:', message);
 *   if (message.notification) {
 *     console.log('Title:', message.notification.title);
 *     console.log('Body:', message.notification.body);
 *   }
 *   if (message.data) {
 *     console.log('Custom data:', message.data);
 *   }
 * });
 * 
 * // Later, to stop listening:
 * unsubscribe();
 */
export const onForegroundMessage = (callback) => {
  if (!messaging) {
    console.warn("Messaging service not available");
    // Return a no-op unsubscribe function
    return () => {};
  }
  return onMessage(messaging, callback);
};
