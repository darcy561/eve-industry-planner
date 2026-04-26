import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { LoadingPage } from "../../Components/loadingPage";
import FirstLoginPage from "../../Components/First Login/page/FirstLoginPage";

export const Route = createFileRoute("/_protected/first-login")({
  component: () => (
    <Suspense fallback={<LoadingPage variant="route" />}>
      <FirstLoginPage />
    </Suspense>
  ),
});
