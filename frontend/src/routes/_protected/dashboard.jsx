import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "../../Components/Dashboard/Dashboard";

export const Route = createFileRoute("/_protected/dashboard")({
  staticData: { audience: "private" },
  component: Dashboard,
});
