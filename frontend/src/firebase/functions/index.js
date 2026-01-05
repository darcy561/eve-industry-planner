import { getFunctions } from "firebase/functions";

/**
 * Initializes Firebase Cloud Functions with region-specific configuration.
 * 
 * This function sets up Firebase Cloud Functions for serverless backend operations:
 * - Enables serverless function execution and management
 * - Supports region-specific function deployment and execution
 * - Provides secure function invocation with authentication
 * - Enables custom business logic execution on Firebase infrastructure
 * - Integrates with other Firebase services for comprehensive backend functionality
 * 
 * The Functions initialization process:
 * 1. Creates Functions instance linked to the Firebase app
 * 2. Configures region-specific function execution
 * 3. Sets up secure function invocation capabilities
 * 4. Enables integration with Firebase Authentication and Firestore
 * 
 * Region configuration benefits:
 * - Reduced latency for region-specific users
 * - Compliance with data residency requirements
 * - Optimized performance for geographic distribution
 * - Enhanced reliability through regional redundancy
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @param {string} region - The region for Firebase Functions (e.g., 'us-central1', 'europe-west1')
 * @returns {import('firebase/functions').Functions} The initialized Functions instance
 * 
 * @example
 * const functions = initializeFunctions(firebaseApp, 'us-central1');
 * console.log('Firebase Functions initialized for us-central1 region');
 * 
 * @example
 * // Call a Cloud Function
 * import { httpsCallable } from 'firebase/functions';
 * const sendEmail = httpsCallable(functions, 'sendEmail');
 * const result = await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   body: 'This is a test email'
 * });
 * console.log('Email sent:', result.data);
 * 
 * @example
 * // Call a function with authentication
 * import { httpsCallable } from 'firebase/functions';
 * const getUserData = httpsCallable(functions, 'getUserData');
 * const userData = await getUserData({ userId: 'user123' });
 * console.log('User data:', userData.data);
 * 
 * @example
 * // Handle function errors
 * try {
 *   const result = await httpsCallable(functions, 'riskyFunction')();
 *   console.log('Function executed successfully:', result.data);
 * } catch (error) {
 *   console.error('Function error:', error.message);
 * }
 */
export const initializeFunctions = (app, region) => {
  return getFunctions(app, region);
}; 