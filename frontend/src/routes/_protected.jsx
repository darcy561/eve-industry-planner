import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireAuth } from '../utils/authGuard'

export const Route = createFileRoute('/_protected')({
  beforeLoad: requireAuth,
  component: ProtectedLayout,
})

function ProtectedLayout() {
  return <Outlet />
}