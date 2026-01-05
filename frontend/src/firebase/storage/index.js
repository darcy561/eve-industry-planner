import { getStorage } from "firebase/storage";

/**
 * Initializes Firebase Storage for file upload, download, and management.
 * 
 * This function sets up Firebase Storage for comprehensive file management:
 * - Enables secure file upload and download operations
 * - Supports multiple file types and formats
 * - Provides file metadata management and organization
 * - Enables secure file access with authentication
 * - Integrates with Firebase Security Rules for file protection
 * 
 * The Storage initialization process:
 * 1. Creates Storage instance linked to the Firebase app
 * 2. Configures secure file storage and access
 * 3. Sets up file upload and download capabilities
 * 4. Enables integration with Firebase Authentication for secure access
 * 
 * Storage capabilities:
 * - File upload with progress tracking
 * - File download with caching
 * - File metadata management and organization
 * - Secure file access with authentication
 * - File deletion and management operations
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @returns {import('firebase/storage').FirebaseStorage} The initialized Storage instance
 * 
 * @example
 * const storage = initializeStorage(firebaseApp);
 * console.log('Firebase Storage initialized');
 * 
 * @example
 * // Upload a file
 * import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
 * const fileRef = ref(storage, 'images/profile.jpg');
 * const snapshot = await uploadBytes(fileRef, file);
 * const downloadURL = await getDownloadURL(snapshot.ref);
 * console.log('File uploaded:', downloadURL);
 * 
 * @example
 * // Upload with progress tracking
 * import { ref, uploadBytesResumable } from 'firebase/storage';
 * const fileRef = ref(storage, 'documents/report.pdf');
 * const uploadTask = uploadBytesResumable(fileRef, file);
 * 
 * uploadTask.on('state_changed', (snapshot) => {
 *   const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
 *   console.log('Upload progress:', progress + '%');
 * });
 * 
 * @example
 * // Download a file
 * import { ref, getDownloadURL } from 'firebase/storage';
 * const fileRef = ref(storage, 'images/profile.jpg');
 * const downloadURL = await getDownloadURL(fileRef);
 * console.log('Download URL:', downloadURL);
 * 
 * @example
 * // Delete a file
 * import { ref, deleteObject } from 'firebase/storage';
 * const fileRef = ref(storage, 'images/old-profile.jpg');
 * await deleteObject(fileRef);
 * console.log('File deleted successfully');
 */
export const initializeStorage = (app) => {
  const storage = getStorage(app);
  return storage;
};
