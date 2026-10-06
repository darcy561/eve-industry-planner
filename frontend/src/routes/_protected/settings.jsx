import { createFileRoute } from "@tanstack/react-router";
import Settings from "../../Components/Settings/settingsPage";

export const Route = createFileRoute("/_protected/settings")({
  staticData: { audience: "private" },
  component: Settings,
});
