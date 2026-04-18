import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { allowPublicAccess } from '../../utils/authGuard'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const EditJob = lazyRouteComponent(() => import('../../Components/Edit Job/editJob'))

export const Route = createFileRoute('/editjob/$jobID')({
  beforeLoad: allowPublicAccess,
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <EditJob />
    </Suspense>
  ),
})
