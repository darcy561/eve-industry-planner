import { createFileRoute, notFound } from "@tanstack/react-router";
import { parseGroupPageViewSearchParam } from "../../Functions/Groups/groupPageViewSearch";
import { ensureGroupJobs } from "../../Functions/Groups/ensureGroupJobs";
import useUsersStore from "../../Zustand/usersStore";
import EditJob from "../../Components/Edit Job/editJob";

export const Route = createFileRoute("/editjob/$jobID")({
  staticData: { audience: "public" },
  validateSearch: (raw) => ({
    activeGroup:
      typeof raw.activeGroup === "string" && raw.activeGroup.length > 0
        ? raw.activeGroup
        : undefined,
    pageView: parseGroupPageViewSearchParam(raw.pageView),
  }),
  loaderDeps: ({ search }) => ({ activeGroup: search.activeGroup }),
  // A finished login holds the jobs on the planner; a job inside a group is not one of
  // them, so the page says what it needs rather than finding out after it has mounted.
  loader: async ({ params, deps }) => {
    const { jobData } = useUsersStore.getState();
    await jobData.actions.jobsFromIdsOrObjects([params.jobID]);

    if (
      !useUsersStore.getState().jobData.actions.findJobInJobArray(params.jobID)
    ) {
      throw notFound();
    }

    // Opened inside a group, the page reads that group's other jobs — the same load
    // opening the group itself does. A group that no longer exists is not this page's
    // to refuse: the URL names the job.
    if (deps.activeGroup) await ensureGroupJobs(deps.activeGroup);
  },
  component: EditJob,
});
