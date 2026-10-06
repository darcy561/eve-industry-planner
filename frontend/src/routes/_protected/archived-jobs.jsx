import { createFileRoute } from "@tanstack/react-router";
import ArchivedJobs from "../../Components/Archived Jobs/ArchivedJobsPage";

export const Route = createFileRoute("/_protected/archived-jobs")({
  staticData: { audience: "private" },
  component: ArchivedJobs,
});
