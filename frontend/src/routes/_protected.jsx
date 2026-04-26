import { createFileRoute, Outlet } from '@tanstack/react-router'
import { redirect } from '@tanstack/react-router'
import { requireAuth } from '../utils/authGuard'
import useUsersStore from '../Zustand/usersStore'

export const Route = createFileRoute('/_protected')({
  beforeLoad: (ctx) => {
    requireAuth(ctx)
    const state = useUsersStore.getState()
    const requiresFirstLogin =
      state.account.actions.getRequiresFirstLoginFlow()

    if (requiresFirstLogin && ctx.location.pathname !== "/first-login") {
      throw redirect({ to: "/first-login" })
    }
  },
  component: ProtectedLayout,
})

function ProtectedLayout() {
  return <Outlet />
}