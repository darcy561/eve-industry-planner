import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const Accounts = lazyRouteComponent(() => import('../../Components/Accounts/Accounts'))

export const Route = createFileRoute('/_protected/accounts')({
  component: () => (
    <Suspense fallback={<LoadingPage />}>
      <Accounts />
    </Suspense>
  ),
})