/**
 * Migration Configuration
 * 
 * Centralized configuration for Firebase to MongoDB migration.
 * Controls which systems are active during the migration process.
 */

/**
 * Migration phases:
 * - PHASE_1_DUAL_WRITE: Write to both Firebase and MongoDB (current)
 * - PHASE_2_MONGODB_PRIMARY: Read from MongoDB, fallback to Firebase
 * - PHASE_3_MONGODB_ONLY: MongoDB only, Firebase disabled
 */

export const MIGRATION_PHASES = {
  DUAL_WRITE: 'dual_write',
  MONGODB_PRIMARY: 'mongodb_primary',
  MONGODB_ONLY: 'mongodb_only',
};

/**
 * Current migration configuration
 * 
 * Controls the behavior of migration utilities for all document types.
 */
export const MIGRATION_CONFIG = {
  // Current phase: 'dual_write' | 'mongodb_primary' | 'mongodb_only'
  phase: MIGRATION_PHASES.DUAL_WRITE,
  
  // Enable MongoDB writes (for dual-write mode)
  enableMongoDBWrites: true,
  
  // Enable Firebase writes (disabled in mongodb_only phase)
  enableFirebaseWrites: true,
  
  // Read from MongoDB first (enabled in mongodb_primary and mongodb_only phases)
  readFromMongoDB: false,
  
  // Fallback to Firebase if MongoDB read fails
  fallbackToFirebase: true,
  
  // Log migration operations for debugging
  enableLogging: true,
};

/**
 * Document-specific migration settings
 * 
 * Allows fine-grained control per document type if needed.
 */
export const DOCUMENT_CONFIG = {
  userDocument: {
    enabled: true,
    // Can override global config per document type if needed
  },
  // Add more document types as needed:
  // jobDocument: { enabled: true },
  // groupDocument: { enabled: true },
};

/**
 * Updates migration configuration
 * 
 * @param {Object} updates - Partial configuration to update
 */
export function updateMigrationConfig(updates) {
  Object.assign(MIGRATION_CONFIG, updates);
  if (MIGRATION_CONFIG.enableLogging) {
    console.info('[Migration] Config updated:', MIGRATION_CONFIG);
  }
}

/**
 * Gets current migration configuration
 * 
 * @returns {Object} Current migration configuration (read-only copy)
 */
export function getMigrationConfig() {
  return { ...MIGRATION_CONFIG };
}

/**
 * Checks if MongoDB writes are enabled
 * 
 * @returns {boolean} True if MongoDB writes should be performed
 */
export function isMongoDBWriteEnabled() {
  return MIGRATION_CONFIG.enableMongoDBWrites && 
         MIGRATION_CONFIG.phase !== MIGRATION_PHASES.MONGODB_ONLY;
}

/**
 * Checks if Firebase writes are enabled
 * 
 * @returns {boolean} True if Firebase writes should be performed
 */
export function isFirebaseWriteEnabled() {
  return MIGRATION_CONFIG.enableFirebaseWrites && 
         MIGRATION_CONFIG.phase !== MIGRATION_PHASES.MONGODB_ONLY;
}

/**
 * Checks if MongoDB reads should be attempted first
 * 
 * @returns {boolean} True if MongoDB reads should be attempted
 */
export function shouldReadFromMongoDB() {
  return MIGRATION_CONFIG.readFromMongoDB || 
         MIGRATION_CONFIG.phase === MIGRATION_PHASES.MONGODB_PRIMARY ||
         MIGRATION_CONFIG.phase === MIGRATION_PHASES.MONGODB_ONLY;
}
