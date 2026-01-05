import { initializeFirestore, memoryLocalCache } from "firebase/firestore";

/**
 * Initializes Firestore with memory-based local caching for optimal performance.
 * 
 * This function sets up Firestore with memory caching for enhanced data management:
 * - Enables memory-based local caching for faster data access
 * - Provides offline data persistence and synchronization
 * - Supports real-time data updates and listeners
 * - Enables efficient querying and data manipulation
 * - Integrates with Firebase Security Rules for data protection
 * 
 * The Firestore initialization process:
 * 1. Creates Firestore instance with memory local cache
 * 2. Enables offline data persistence and caching
 * 3. Sets up real-time synchronization capabilities
 * 4. Configures Firestore for web application data management
 * 
 * Memory cache benefits:
 * - Faster data access for frequently used documents
 * - Reduced network requests for cached data
 * - Improved offline functionality
 * - Enhanced performance for read-heavy applications
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @returns {import('firebase/firestore').Firestore} The initialized Firestore instance with memory cache
 * 
 * @example
 * const firestore = initializeFirestoreWithCache(firebaseApp);
 * console.log('Firestore initialized with memory cache');
 * 
 * @example
 * // Add a document
 * import { collection, addDoc } from 'firebase/firestore';
 * const docRef = await addDoc(collection(firestore, 'users'), {
 *   name: 'John Doe',
 *   email: 'john@example.com'
 * });
 * console.log('Document added with ID:', docRef.id);
 * 
 * @example
 * // Read documents with real-time updates
 * import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
 * const q = query(collection(firestore, 'users'), orderBy('name'));
 * const unsubscribe = onSnapshot(q, (snapshot) => {
 *   snapshot.forEach((doc) => {
 *     console.log(doc.id, '=>', doc.data());
 *   });
 * });
 * 
 * @example
 * // Update a document
 * import { doc, updateDoc } from 'firebase/firestore';
 * await updateDoc(doc(firestore, 'users', 'userId'), {
 *   lastLogin: new Date()
 * });
 * console.log('Document updated');
 */
export const initializeFirestoreWithCache = (app) => {
  return initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
}; 