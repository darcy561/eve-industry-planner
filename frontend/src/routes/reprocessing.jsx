import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingPage } from '../Components/loadingPage'
import { allowPublicAccess } from '../utils/authGuard'

const Reprocessing = lazyRouteComponent(() => import('../Components/Reprocessing/reprocessingPage'))

export const Route = createFileRoute('/reprocessing')({
  beforeLoad: allowPublicAccess,
  component: () => (
    <Suspense fallback={<LoadingPage />}>
      <Reprocessing />
    </Suspense>
  ),
})
