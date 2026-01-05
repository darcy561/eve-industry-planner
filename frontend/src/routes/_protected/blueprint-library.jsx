import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const BlueprintLibrary = lazyRouteComponent(() => import('../../Components/Blueprint Library/BlueprintLibrary'))

export const Route = createFileRoute('/_protected/blueprint-library')({
  component: () => (
    <Suspense fallback={<LoadingPage />}>
      <BlueprintLibrary />
    </Suspense>
  ),
})