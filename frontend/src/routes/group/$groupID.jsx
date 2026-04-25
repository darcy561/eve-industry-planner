import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { allowPublicAccess } from '../../utils/authGuard'
import { Suspense } from 'react'
import { LoadingPage } from '../../Components/loadingPage'
import { parseGroupPageViewSearchParam } from '../../Functions/Groups/groupPageViewSearch'

const GroupFrame = lazyRouteComponent(() => import('../../Components/Groups/groupFrame'))

export const Route = createFileRoute('/group/$groupID')({
  beforeLoad: allowPublicAccess,
  validateSearch: (raw) => ({
    pageView: parseGroupPageViewSearchParam(raw.pageView),
    focusJobId:
      typeof raw.focusJobId === "string" && raw.focusJobId.trim() !== ""
        ? raw.focusJobId.trim()
        : undefined,
  }),
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <GroupFrame />
    </Suspense>
  ),
})
