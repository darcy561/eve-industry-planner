/**
 * Utility functions for route management and validation with TanStack Router.
 *
 * This module provides functions to:
 */

import { routeTree } from '../routeTree.gen.js';

/**
 * Extracts all protected route paths from the TanStack Router route tree.
 *
 * The function dynamically extracts routes from the TanStack Router's generated route tree,
 * making it automatically update when new protected routes are added to the _protected folder.
 *
 * @returns {string[]} Array of protected route paths (e.g., ['/dashboard', '/accounts'])
 */
export function getProtectedRoutes() {
  const protectedRoutes = [];

  try {
    // The route tree structure has a ProtectedRouteChildren object
    // We need to access the children of the ProtectedRoute
    function extractProtectedRoutes(route) {
      // Check if this route has children
      if (route && route.children) {
        // Look for the ProtectedRoute in the children
        const protectedRoute = route.children.ProtectedRoute;

        if (protectedRoute && protectedRoute.children) {
          // Extract all child routes under the protected container
          Object.values(protectedRoute.children).forEach(childRoute => {
            if (childRoute && childRoute.path) {
              protectedRoutes.push(childRoute.path);
            }
          });
        }
      }
    }

    // Start extraction from the root route
    extractProtectedRoutes(routeTree);

    // If no routes were found, fall back to a known list
    if (protectedRoutes.length === 0) {
      return [
        '/dashboard',
        '/accounts',
        '/settings',
        '/blueprint-library',
        '/asset-library'
      ];
    }

    return protectedRoutes;

  } catch (error) {
    console.error("❌ Error extracting protected routes from route tree:", error);
    // Fallback to known protected routes
    return [
      '/dashboard',
      '/accounts',
      '/settings',
      '/blueprint-library',
      '/asset-library'
    ];
  }
}

/**
 * Checks if a given path is a protected route that requires authentication.
 *
 * @param {string} path - The path to check (e.g., '/dashboard', '/accounts')
 * @returns {boolean} True if the path is protected, false otherwise
 */
export function isProtectedRoute(path) {
  // Get statically defined protected routes from TanStack Router structure
  const protectedRoutes = getProtectedRoutes();

  // Check if path matches any protected route exactly or starts with it
  const isStaticallyProtected = protectedRoutes.some(route => {
    return path === route || path.startsWith(route + '/');
  });
  // Also check for dynamic routes that should be protected
  const dynamicProtectedPatterns = [
    /^\/editjob\/\w+$/,  // /editjob/:jobID
    /^\/group\/\w+$/,    // /group/:groupID (but not /group/new)
  ];

  const isDynamicallyProtected = dynamicProtectedPatterns.some(pattern => {
    return pattern.test(path);
  });

  // Special case: /group/new should not be protected
  if (path === '/group/new') {
    return false;
  }
  return isStaticallyProtected || isDynamicallyProtected;
}

/**
 * Determines the appropriate redirect path after authentication.
 *
 * @param {string} originalPath - The original path the user was trying to access
 * @param {string} defaultPath - The default path to redirect to if original is protected (default: '/dashboard')
 * @returns {string} The path to redirect to after authentication
 */
export function getRedirectPathAfterAuth(originalPath, defaultPath = '/dashboard') {
  if (!originalPath) {
    return defaultPath;
  }

  // If the original path is protected, always redirect to dashboard
  // This ensures users don't get stuck on secure routes after refresh/login
  if (isProtectedRoute(originalPath)) {
    return defaultPath;
  }

  // Otherwise, redirect to the original path (public routes only)
  return originalPath;
}