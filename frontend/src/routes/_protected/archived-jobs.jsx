import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const ArchivedJobs = lazyRouteComponent(
  () => import('../../Components/Archived Jobs/ArchivedJobsPage'),
)

export const Route = createFileRoute('/_protected/archived-jobs')({
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <ArchivedJobs />
    </Suspense>
  ),
})
