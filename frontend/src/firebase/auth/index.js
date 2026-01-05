import { getAuth } from "firebase/auth";

/**
 * Initializes Firebase Authentication for user management and security.
 * 
 * This function sets up Firebase Authentication for comprehensive user management:
 * - Enables user registration and authentication
 * - Supports multiple authentication providers (email, Google, etc.)
 * - Provides secure user session management
 * - Enables password reset and account management
 * - Integrates with Firebase Security Rules for data protection
 * 
 * The Authentication initialization process:
 * 1. Creates Auth instance linked to the Firebase app
 * 2. Enables authentication state persistence
 * 3. Sets up automatic token refresh for secure sessions
 * 4. Configures authentication for web application security
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @returns {import('firebase/auth').Auth} The initialized Auth instance
 * 
 * @example
 * const auth = initializeAuth(firebaseApp);
 * console.log('Firebase Authentication initialized');
 * 
 * @example
 * // Sign in with email and password
 * import { signInWithEmailAndPassword } from 'firebase/auth';
 * const userCredential = await signInWithEmailAndPassword(auth, email, password);
 * console.log('User signed in:', userCredential.user);
 * 
 * @example
 * // Listen to authentication state changes
 * import { onAuthStateChanged } from 'firebase/auth';
 * onAuthStateChanged(auth, (user) => {
 *   if (user) {
 *     console.log('User is signed in:', user.uid);
 *   } else {
 *     console.log('User is signed out');
 *   }
 * });
 * 
 * @example
 * // Sign out user
 * import { signOut } from 'firebase/auth';
 * await signOut(auth);
 * console.log('User signed out');
 */
export const initializeAuth = (app) => {
  return getAuth(app);
}; 