import { createFileRoute } from "@tanstack/react-router";
import JobPlanner from "../Components/Job Planner/JobPlanner";

export const Route = createFileRoute("/jobplanner")({
  staticData: { audience: "public" },
  component: JobPlanner,
});
