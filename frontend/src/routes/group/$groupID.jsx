import { createFileRoute, notFound } from "@tanstack/react-router";
import { parseGroupPageViewSearchParam } from "../../Functions/Groups/groupPageViewSearch";
import { prepareGroupPage } from "../../Functions/Groups/prepareGroupPage";
import GroupFrame from "../../Components/Groups/groupFrame";

export const Route = createFileRoute("/group/$groupID")({
  staticData: { audience: "public" },
  validateSearch: (raw) => ({
    pageView: parseGroupPageViewSearchParam(raw.pageView),
    focusJobId:
      typeof raw.focusJobId === "string" && raw.focusJobId.trim() !== ""
        ? raw.focusJobId.trim()
        : undefined,
  }),
  // The page draws a whole chain of jobs and what they cost: fetched here so the reader
  // waits on the router's pending screen rather than watching the figures arrive.
  loader: async ({ params }) => {
    if (!(await prepareGroupPage(params.groupID))) throw notFound();
  },
  component: GroupFrame,
});
