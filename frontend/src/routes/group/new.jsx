import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { allowPublicAccess } from '../../utils/authGuard'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const NewGroup = lazyRouteComponent(() => import('../../Components/Groups/New Group/newGroupPage'))

export const Route = createFileRoute('/group/new')({
  beforeLoad: allowPublicAccess,
  component: () => (
    <Suspense fallback={<LoadingPage />}>
      <NewGroup />
    </Suspense>
  ),
})
