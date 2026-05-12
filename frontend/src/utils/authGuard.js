import { redirect } from '@tanstack/react-router'
import useUsersStore from '../Zustand/usersStore'

/** Mirrors backend `auth.EsiOAuthStorageCookieName` / `EsiOAuthStorageServer` (non-secret routing hint). */
const EIP_ESI_OAUTH_STORAGE_COOKIE = 'eip_esi_oauth_storage'
const EIP_ESI_OAUTH_STORAGE_SERVER = 'server'

/**
 * True when the server set cloud ("server-side") OAuth storage — same hint used with HttpOnly app refresh.
 * Avoids POST …/auth/sessions/bootstrap on every public route load just to detect a cookie session.
 */
function hasCloudOAuthStorageServerHint() {
  if (typeof document === 'undefined') {
    return false
  }
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (name === EIP_ESI_OAUTH_STORAGE_COOKIE && value === EIP_ESI_OAUTH_STORAGE_SERVER) {
      return true
    }
  }
  return false
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
export function allowPublicAccess({ location }) {
  const isLoggedIn = useUsersStore.getState().account.isLoggedIn
  
  if (!isLoggedIn) {
    const existingAuth = localStorage.getItem("Auth");
    if (existingAuth || hasCloudOAuthStorageServerHint()) {
      // If there's an auth token but user isn't logged in,
      // or the cloud routing cookie indicates server-held OAuth (cold reload resume), redirect to auth
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
