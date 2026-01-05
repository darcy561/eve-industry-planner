import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'

const AssetLibrary = lazyRouteComponent(() => import('../../Components/Assets/assets'))

export const Route = createFileRoute('/_protected/asset-library')({
  component: () => (
    <Suspense fallback={<LoadingPage />}>
      <AssetLibrary />
    </Suspense>
  ),
})