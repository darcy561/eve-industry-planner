import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { allowPublicAccess } from '../../utils/authGuard'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const GroupFrame = lazyRouteComponent(() => import('../../Components/Groups/groupFrame'))

export const Route = createFileRoute('/group/$groupID')({
  beforeLoad: allowPublicAccess,
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <GroupFrame />
    </Suspense>
  ),
})
