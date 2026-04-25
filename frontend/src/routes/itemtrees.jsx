import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Suspense } from "react";
import { LoadingPage } from "../Components/loadingPage";
import { allowPublicAccess } from "../utils/authGuard";

const ItemTree = lazyRouteComponent(() => import("../Components/item Tree/ItemTree"));

export const Route = createFileRoute("/itemtrees")({
  beforeLoad: allowPublicAccess,
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <ItemTree />
    </Suspense>
  ),
});
