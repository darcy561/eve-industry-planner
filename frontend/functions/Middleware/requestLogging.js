import { debug, warn, error } from "firebase-functions/logger";

/**
 * Request logging middleware for API endpoints.
 * 
 * This middleware provides comprehensive request and response logging:
 * - Logs incoming requests with detailed metadata (method, URL, headers, body info)
 * - Tracks request duration and performance metrics
 * - Logs response completion with status codes and timing
 * - Identifies slow requests (>5 seconds) with warnings
 * - Logs failed requests (4xx/5xx status codes) as errors
 * - Generates unique request IDs for correlation
 * - Redacts sensitive information (authorization headers)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() to continue middleware chain
 * 
 * @example
 * // Usage in Express app
 * app.use(requestLogging);
 * 
 * // Logs will include:
 * // - Request start with metadata
 * // - Response completion with timing
 * // - Performance warnings for slow requests
 * // - Error logs for failed requests
 */
const requestLogging = (req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  // Log incoming request
  debug("API Request Started", {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      'x-firebase-appcheck': req.get('X-Firebase-AppCheck') ? '[PRESENT]' : undefined,
    },
    body: req.method === 'POST' ? {
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      bodySize: req.body ? JSON.stringify(req.body).length : 0
    } : undefined
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    const responseSize = chunk ? chunk.length : 0;
    
    debug("API Request Completed", {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize,
      success: res.statusCode >= 200 && res.statusCode < 300
    });

    // Log warnings for slow requests
    if (duration > 5000) {
      warn("Slow API Request", {
        requestId,
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    }

    // Log errors for failed requests
    if (res.statusCode >= 400) {
      error("API Request Failed", {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

export default requestLogging;
