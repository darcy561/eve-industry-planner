import { createFileRoute } from "@tanstack/react-router";
import NewGroup from "../../Components/Groups/New Group/newGroupPage";

export const Route = createFileRoute("/group/new")({
  staticData: { audience: "public" },
  component: NewGroup,
});
