# Migration Utilities

This folder contains utilities for migrating from Firebase to MongoDB.

## Structure

- **`config.js`** - Centralized migration configuration
- **`dualWrite.js`** - Generic dual-write utilities for any document type
- **`userDocument.js`** - User document-specific migration functions
- **`README.md`** - This file

## Migration Phases

### Phase 1: Dual-Write (Current)
- Writes to both Firebase and MongoDB
- Firebase is primary (failures throw)
- MongoDB is secondary (failures are logged but non-blocking)
- Reads from Firebase

### Phase 2: MongoDB Primary
- Writes to both Firebase and MongoDB
- MongoDB is primary (failures throw)
- Firebase is secondary (failures are logged but non-blocking)
- Reads from MongoDB with Firebase fallback

### Phase 3: MongoDB Only
- Writes only to MongoDB
- Reads only from MongoDB
- Firebase disabled

## Usage

### For User Documents

```javascript
import { saveUserDocumentDual } from '../Migration/userDocument.js';

// Saves to both Firebase and MongoDB (Firebase primary)
await saveUserDocumentDual();
```

### For New Document Types

1. Create a new file in `Migration/` folder (e.g., `jobDocument.js`)
2. Use the dual-write utilities:

```javascript
import { dualWriteFirebasePrimary } from './dualWrite.js';
import { saveJobToMongoDB } from '../Endpoints/Pirivate/jobDocument.js';
import { saveJobToFirebase } from '../Firebase/jobDocument.js';

export async function saveJobDocumentDual() {
  return dualWriteFirebasePrimary({
    mongoWrite: () => saveJobToMongoDB(),
    firebaseWrite: () => saveJobToFirebase(),
    documentType: 'jobDocument',
  });
}
```

## Configuration

Edit `config.js` to control migration behavior:

```javascript
export const MIGRATION_CONFIG = {
  phase: MIGRATION_PHASES.DUAL_WRITE,
  enableMongoDBWrites: true,
  enableFirebaseWrites: true,
  readFromMongoDB: false,
  fallbackToFirebase: true,
  enableLogging: true,
};
```

## Dual-Write Strategies

### `dualWriteFirebasePrimary`
- Firebase write is primary (throws on failure)
- MongoDB write is non-blocking (logs errors)
- Use during Phase 1 (current)

### `dualWriteMongoDBPrimary`
- MongoDB write is primary (throws on failure)
- Firebase write is non-blocking (logs errors)
- Use during Phase 2

### `dualWrite`
- Both writes run in parallel
- Both must succeed if `requireBoth: true`
- Use when both systems are equally important
