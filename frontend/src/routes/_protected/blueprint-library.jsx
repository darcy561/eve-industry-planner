import { createFileRoute } from "@tanstack/react-router";
import BlueprintLibrary from "../../Components/Blueprint Library/BlueprintLibrary";

export const Route = createFileRoute("/_protected/blueprint-library")({
  staticData: { audience: "private" },
  component: BlueprintLibrary,
});
