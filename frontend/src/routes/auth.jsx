import { createFileRoute, redirect, lazyRouteComponent } from '@tanstack/react-router'
import useUsersStore from '../Zustand/usersStore'
import { Suspense } from 'react'
import { LoadingPage } from '../Components/loadingPage'
import { getRedirectPathAfterAuth } from '../utils/routeUtils'

const AuthMainUser = lazyRouteComponent(() => import('../Components/Auth/MainUserAuth'))

export const Route = createFileRoute('/auth')({
  beforeLoad: ({ search }) => {
    const state = useUsersStore.getState()
    const isLoggedIn = state.account.isLoggedIn
    
    // If user is already logged in, redirect them away from auth page
    if (isLoggedIn) {
      const needsFirstLoginFlow =
        state.account.actions.getRequiresFirstLoginFlow()

      if (needsFirstLoginFlow) {
        throw redirect({
          to: "/first-login",
        })
      }

      // Get the original path from the state parameter
      const originalPath = search.state
      
      // Determine redirect path using the utility function
      const redirectPath = getRedirectPathAfterAuth(originalPath, "/dashboard")
      
      // Clean up the originalPath from localStorage after determining redirect
      if (originalPath) {
        localStorage.removeItem("originalPath");
      }
      
      throw redirect({
        to: redirectPath,
      })
    }
  },
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <AuthMainUser />
    </Suspense>
  ),
})
