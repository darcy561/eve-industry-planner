import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const Dashboard = lazyRouteComponent(() => import('../../Components/Dashboard/Dashboard'))

export const Route = createFileRoute('/_protected/dashboard')({
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <Dashboard />
    </Suspense>
  ),
})