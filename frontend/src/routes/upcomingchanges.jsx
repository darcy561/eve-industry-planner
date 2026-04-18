import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { allowPublicAccess } from '../utils/authGuard'
import { Suspense } from 'react'
import { LoadingPage } from '../Components/loadingPage'

const UpcomingChanges = lazyRouteComponent(() => import('../Components/Upcoming Changes/upcomingReleases'))

export const Route = createFileRoute('/upcomingchanges')({
  beforeLoad: allowPublicAccess,
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <UpcomingChanges />
    </Suspense>
  ),
})
