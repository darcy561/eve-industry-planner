import { createFileRoute } from "@tanstack/react-router";
import AssetLibrary from "../../Components/Assets/assets";

export const Route = createFileRoute("/_protected/asset-library")({
  staticData: { audience: "private" },
  component: AssetLibrary,
});
