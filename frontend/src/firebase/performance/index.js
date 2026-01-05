import { getPerformance } from "firebase/performance";

/**
 * Initializes Firebase Performance Monitoring for application performance tracking.
 * 
 * This function sets up Firebase Performance Monitoring for comprehensive app performance insights:
 * - Enables automatic performance monitoring and tracking
 * - Provides detailed performance metrics and insights
 * - Supports custom performance traces and measurements
 * - Monitors network requests and database operations
 * - Enables performance optimization through data-driven insights
 * 
 * The Performance Monitoring initialization process:
 * 1. Creates Performance instance linked to the Firebase app
 * 2. Enables automatic collection of performance metrics
 * 3. Sets up monitoring for web application performance
 * 4. Configures performance tracking for Firebase services
 * 
 * Performance monitoring capabilities:
 * - Page load times and navigation performance
 * - Network request performance and latency
 * - Database query performance and optimization
 * - Custom trace measurements for specific operations
 * - Performance insights and optimization recommendations
 * 
 * @param {import('firebase/app').FirebaseApp} app - The Firebase app instance
 * @returns {import('firebase/performance').Performance} The initialized Performance instance
 * 
 * @example
 * const performance = initializePerformance(firebaseApp);
 * console.log('Firebase Performance Monitoring initialized');
 * 
 * @example
 * // Create custom performance trace
 * import { trace } from 'firebase/performance';
 * const customTrace = trace(performance, 'custom_operation');
 * customTrace.start();
 * 
 * // Perform some operation
 * await performOperation();
 * 
 * customTrace.stop();
 * console.log('Custom trace completed');
 * 
 * @example
 * // Measure function execution time
 * import { trace } from 'firebase/performance';
 * const functionTrace = trace(performance, 'data_processing');
 * functionTrace.start();
 * 
 * try {
 *   await processData();
 * } finally {
 *   functionTrace.stop();
 * }
 * 
 * @example
 * // Add custom attributes to trace
 * import { trace } from 'firebase/performance';
 * const userTrace = trace(performance, 'user_action');
 * userTrace.putAttribute('user_type', 'premium');
 * userTrace.putAttribute('action_type', 'purchase');
 * userTrace.start();
 * 
 * await handleUserAction();
 * userTrace.stop();
 */
export const initializePerformance = (app) => {
  return getPerformance(app);
}; 