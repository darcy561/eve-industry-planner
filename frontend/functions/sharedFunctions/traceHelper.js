import { randomUUID } from 'crypto';

/**
 * Gets trace ID for any function context with automatic detection.
 * 
 * This utility function automatically detects the context type and extracts or generates
 * an appropriate trace ID for request tracking and debugging:
 * - Detects HTTP requests and extracts trace headers
 * - Handles scheduled function events with trace properties
 * - Generates UUIDs for contexts without trace information
 * - Provides consistent trace ID format across all function types
 * 
 * @param {Object} [context] - Function context object (req, event, or any object)
 * @param {Object} [context.headers] - HTTP headers object (for HTTP requests)
 * @param {string} [context.headers['x-cloud-trace-context']] - Cloud trace header
 * @param {string} [context.trace] - Trace ID property (for scheduled events)
 * @returns {string} Trace ID for request tracking
 * 
 * @example
 * // HTTP request context
 * const traceId = getTraceId(req);
 * 
 * // Scheduled function context
 * const traceId = getTraceId(event);
 * 
 * // No context (generates UUID)
 * const traceId = getTraceId();
 */
export function getTraceId(context) {
  // If no context provided, generate a UUID
  if (!context) {
    return randomUUID();
  }

  // Check if it's an HTTP request (has headers property)
  if (context.headers) {
    const traceHeader = context.headers['x-cloud-trace-context'] || context.headers['X-Cloud-Trace-Context'];
    if (traceHeader) {
      return traceHeader.split('/')[0];
    }
    // If it's a request but no trace header, generate UUID
    return randomUUID();
  }

  // Check if it's a scheduled function event (has trace property or is an event object)
  if (context.trace) {
    return context.trace;
  }

  // For any other context (scheduled events without trace, or fallback), generate UUID
  return randomUUID();
}
