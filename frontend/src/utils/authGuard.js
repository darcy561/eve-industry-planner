import { redirect } from '@tanstack/react-router'
import useUsersStore from '../Zustand/usersStore'
import { refreshServerJWTForLogin } from '../Functions/Auth/serverTokens'

async function hasCookieCloudSession() {
  try {
    await refreshServerJWTForLogin(null, '')
    return true
  } catch {
    return false
  }
}

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
export async function allowPublicAccess({ location }) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn
  
  if (!isLoggedIn) {
    const existingAuth = localStorage.getItem("Auth");
    if (existingAuth || (await hasCookieCloudSession())) {
      // If there's an auth token but user isn't logged in, 
      // or a valid HttpOnly cloud cookie session exists, redirect to auth
      // to rebuild client state and then return to this page.
      throw redirect({
        to: '/auth',
        search: {
          state: location.pathname,
        },
      })
    }
    // No auth token - allow public access
  }
  
  return { isLoggedIn }
}
