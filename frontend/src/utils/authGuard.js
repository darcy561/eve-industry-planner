import { redirect } from '@tanstack/react-router'
import useUsersStore from '../Zustand/usersStore'
import { hasResumablePlannerSession } from '../Functions/Auth/tabSessionStorage.js'

/**
 * Authentication guard function for TanStack Router routes.
 * Checks if user is logged in and redirects to auth page if not.
 * 
 * @param {Object} context - The route context from TanStack Router
 * @param {Object} context.location - The current location object
 * @throws {redirect} Throws a redirect to /auth if user is not logged in
 * 
 * @example
 * export const Route = createFileRoute('/protected-page')({
 *   beforeLoad: requireAuth,
 *   component: ProtectedComponent,
 * })
 */
export function requireAuth({ location }) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn
  
  if (!isLoggedIn) {
    throw redirect({
      to: '/auth',
      search: {
        state: location.pathname,
      },
    })
  }
}

/**
 * Public access guard - allows access to public users but logs in users with auth tokens.
 * 
 * @param {Object} context - The route context from TanStack Router
 * @param {Object} context.location - The current location object
 * @throws {redirect} Throws a redirect to /auth if there's an auth token that needs refreshing
 * @returns {Object} User authentication state
 * 
 * @example
 * export const Route = createFileRoute('/public-page')({
 *   beforeLoad: allowPublicAccess,
 *   component: PublicComponent,
 * })
 */
export function allowPublicAccess({ location }) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn
  
  if (!isLoggedIn && hasResumablePlannerSession()) {
    // Stored ESI refresh, per-tab planner refresh, or cloud routing hint — rebuild on /auth.
    throw redirect({
      to: '/auth',
      search: {
        state: location.pathname,
      },
    })
  }
  
  return { isLoggedIn }
}
