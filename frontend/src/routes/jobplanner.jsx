import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { allowPublicAccess } from '../utils/authGuard'
import { Suspense } from 'react'
import { LoadingPage } from '../Components/loadingPage'

const JobPlanner = lazyRouteComponent(() => import('../Components/Job Planner/JobPlanner'))

export const Route = createFileRoute('/jobplanner')({
  beforeLoad: allowPublicAccess,
  component: () => (
    <Suspense fallback={<LoadingPage />}>
      <JobPlanner />
    </Suspense>
  ),
})
