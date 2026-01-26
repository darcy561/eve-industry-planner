/**
 * Dual-Write Utility
 * 
 * Provides a generic dual-write mechanism for migrating from Firebase to MongoDB.
 * Handles writing to both systems in parallel during migration phases.
 */

import {
  MIGRATION_CONFIG,
  isMongoDBWriteEnabled,
  isFirebaseWriteEnabled,
} from './config.js';

/**
 * Dual-write result structure
 * @typedef {Object} DualWriteResult
 * @property {boolean} mongo - Whether MongoDB write succeeded
 * @property {boolean} firebase - Whether Firebase write succeeded
 * @property {Error|null} mongoError - MongoDB write error if any
 * @property {Error|null} firebaseError - Firebase write error if any
 */

/**
 * Performs dual-write to both MongoDB and Firebase
 * 
 * Writes to both systems in parallel based on migration configuration.
 * Returns success if at least one write succeeds (or both if configured).
 * 
 * @param {Object} options - Dual-write options
 * @param {Function} options.mongoWrite - Function that writes to MongoDB, returns Promise<boolean>
 * @param {Function} options.firebaseWrite - Function that writes to Firebase, returns Promise<void>
 * @param {string} [options.documentType] - Type of document being written (for logging)
 * @param {boolean} [options.requireBoth] - If true, both writes must succeed (default: false)
 * @returns {Promise<DualWriteResult>} Promise that resolves to write results
 * 
 * @example
 * const result = await dualWrite({
 *   mongoWrite: () => saveUserDocument(),
 *   firebaseWrite: () => uploadApplicationSettingsToFirebase(),
 *   documentType: 'userDocument'
 * });
 */
export async function dualWrite({
  mongoWrite,
  firebaseWrite,
  documentType = 'document',
  requireBoth = false,
}) {
  const result = {
    mongo: false,
    firebase: false,
    mongoError: null,
    firebaseError: null,
  };

  const promises = [];

  // MongoDB write
  if (isMongoDBWriteEnabled()) {
    const mongoPromise = mongoWrite()
      .then((success) => {
        result.mongo = success;
        if (MIGRATION_CONFIG.enableLogging && success) {
          console.debug(`[Migration] ${documentType} saved to MongoDB successfully`);
        }
        return success;
      })
      .catch((error) => {
        result.mongoError = error;
        console.error(`[Migration] Failed to save ${documentType} to MongoDB:`, error);
        return false;
      });
    promises.push(mongoPromise);
  }

  // Firebase write
  if (isFirebaseWriteEnabled()) {
    const firebasePromise = firebaseWrite()
      .then(() => {
        result.firebase = true;
        if (MIGRATION_CONFIG.enableLogging) {
          console.debug(`[Migration] ${documentType} saved to Firebase successfully`);
        }
        return true;
      })
      .catch((error) => {
        result.firebaseError = error;
        console.error(`[Migration] Failed to save ${documentType} to Firebase:`, error);
        return false;
      });
    promises.push(firebasePromise);
  }

  // Wait for all writes to complete
  if (promises.length > 0) {
    await Promise.all(promises);
  }

  // Validate results
  if (requireBoth) {
    if (!result.mongo && isMongoDBWriteEnabled()) {
      throw new Error(`Dual-write failed: MongoDB write required but failed`);
    }
    if (!result.firebase && isFirebaseWriteEnabled()) {
      throw new Error(`Dual-write failed: Firebase write required but failed`);
    }
  }

  // Log summary
  if (MIGRATION_CONFIG.enableLogging) {
    const successCount = (result.mongo ? 1 : 0) + (result.firebase ? 1 : 0);
    const totalExpected = (isMongoDBWriteEnabled() ? 1 : 0) + (isFirebaseWriteEnabled() ? 1 : 0);
    console.debug(
      `[Migration] ${documentType} dual-write complete: ${successCount}/${totalExpected} succeeded`
    );
  }

  return result;
}

/**
 * Performs dual-write with non-blocking MongoDB (Firebase primary)
 * 
 * Firebase write is primary - if it fails, the function throws.
 * MongoDB write runs in parallel but failures are non-blocking.
 * 
 * @param {Object} options - Dual-write options
 * @param {Function} options.mongoWrite - Function that writes to MongoDB, returns Promise<boolean>
 * @param {Function} options.firebaseWrite - Function that writes to Firebase, returns Promise<void>
 * @param {string} [options.documentType] - Type of document being written (for logging)
 * @returns {Promise<DualWriteResult>} Promise that resolves to write results
 * 
 * @example
 * const result = await dualWriteFirebasePrimary({
 *   mongoWrite: () => saveUserDocument(),
 *   firebaseWrite: () => uploadApplicationSettingsToFirebase(),
 *   documentType: 'userDocument'
 * });
 */
export async function dualWriteFirebasePrimary({
  mongoWrite,
  firebaseWrite,
  documentType = 'document',
}) {
  const result = {
    mongo: false,
    firebase: false,
    mongoError: null,
    firebaseError: null,
  };

  // Start MongoDB write in parallel (non-blocking)
  let mongoPromise = Promise.resolve(false);
  if (isMongoDBWriteEnabled()) {
    mongoPromise = mongoWrite()
      .then((success) => {
        result.mongo = success;
        if (MIGRATION_CONFIG.enableLogging && success) {
          console.debug(`[Migration] ${documentType} saved to MongoDB successfully`);
        }
        return success;
      })
      .catch((error) => {
        result.mongoError = error;
        console.error(`[Migration] MongoDB dual-write failed (non-blocking):`, error);
        return false;
      });
  }

  // Firebase write is primary - wait for it and throw if it fails
  try {
    await firebaseWrite();
    result.firebase = true;
    if (MIGRATION_CONFIG.enableLogging) {
      console.debug(`[Migration] ${documentType} saved to Firebase successfully`);
    }
  } catch (error) {
    result.firebaseError = error;
    throw error; // Re-throw Firebase errors as they're primary
  }

  // Wait for MongoDB write to complete (but don't fail if it did)
  await mongoPromise;

  return result;
}

/**
 * Performs dual-write with non-blocking Firebase (MongoDB primary)
 * 
 * MongoDB write is primary - if it fails, the function throws.
 * Firebase write runs in parallel but failures are non-blocking.
 * 
 * @param {Object} options - Dual-write options
 * @param {Function} options.mongoWrite - Function that writes to MongoDB, returns Promise<boolean>
 * @param {Function} options.firebaseWrite - Function that writes to Firebase, returns Promise<void>
 * @param {string} [options.documentType] - Type of document being written (for logging)
 * @returns {Promise<DualWriteResult>} Promise that resolves to write results
 * 
 * @example
 * const result = await dualWriteMongoDBPrimary({
 *   mongoWrite: () => saveUserDocument(),
 *   firebaseWrite: () => uploadApplicationSettingsToFirebase(),
 *   documentType: 'userDocument'
 * });
 */
export async function dualWriteMongoDBPrimary({
  mongoWrite,
  firebaseWrite,
  documentType = 'document',
}) {
  const result = {
    mongo: false,
    firebase: false,
    mongoError: null,
    firebaseError: null,
  };

  // Start Firebase write in parallel (non-blocking)
  let firebasePromise = Promise.resolve();
  if (isFirebaseWriteEnabled()) {
    firebasePromise = firebaseWrite()
      .then(() => {
        result.firebase = true;
        if (MIGRATION_CONFIG.enableLogging) {
          console.debug(`[Migration] ${documentType} saved to Firebase successfully`);
        }
      })
      .catch((error) => {
        result.firebaseError = error;
        console.error(`[Migration] Firebase dual-write failed (non-blocking):`, error);
      });
  }

  // MongoDB write is primary - wait for it and throw if it fails
  try {
    const success = await mongoWrite();
    if (!success) {
      throw new Error('MongoDB write returned false');
    }
    result.mongo = true;
    if (MIGRATION_CONFIG.enableLogging) {
      console.debug(`[Migration] ${documentType} saved to MongoDB successfully`);
    }
  } catch (error) {
    result.mongoError = error;
    throw error; // Re-throw MongoDB errors as they're primary
  }

  // Wait for Firebase write to complete (but don't fail if it did)
  await firebasePromise;

  return result;
}
