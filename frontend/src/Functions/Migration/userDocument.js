/**
 * User Document Migration
 * 
 * Handles dual-write and migration for user documents specifically.
 * Uses the generic dual-write utilities with user document-specific functions.
 */

import { dualWriteFirebasePrimary } from './dualWrite.js';
import { saveUserDocument } from '../Endpoints/Pirivate/userDocument.js';
import { uploadApplicationSettingsToFirebaseOnly } from '../Firebase/uploadApplicationSettings.js';

/**
 * Saves user document with dual-write (Firebase primary, MongoDB secondary)
 * 
 * During migration phase, writes to both Firebase and MongoDB.
 * Firebase is primary - if it fails, the function throws.
 * MongoDB write is non-blocking - failures are logged but don't throw.
 * 
 * This matches the current behavior where Firebase is the primary system
 * and MongoDB is being added as a secondary write during migration.
 * 
 * @returns {Promise<Object>} Promise that resolves to dual-write result
 * @throws {Error} Throws error if Firebase write fails
 * 
 * @example
 * const result = await saveUserDocumentDual();
 * if (result.mongo) {
 *   console.log("MongoDB write succeeded");
 * }
 */
export async function saveUserDocumentDual() {
  return dualWriteFirebasePrimary({
    mongoWrite: () => saveUserDocument(),
    firebaseWrite: () => uploadApplicationSettingsToFirebaseOnly(),
    documentType: 'userDocument',
  });
}

/**
 * Re-exports for convenience
 */
export { saveUserDocument } from '../Endpoints/Pirivate/userDocument.js';
export { getUserDocument } from '../Endpoints/Pirivate/userDocument.js';
