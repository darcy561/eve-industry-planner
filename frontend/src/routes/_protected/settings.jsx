import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const Settings = lazyRouteComponent(() => import('../../Components/Settings/settingsPage'))

export const Route = createFileRoute('/_protected/settings')({
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <Settings />
    </Suspense>
  ),
})