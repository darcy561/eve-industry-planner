import { createFileRoute } from "@tanstack/react-router";
import ItemTree from "../Components/item Tree/ItemTree";

export const Route = createFileRoute("/itemtrees")({
  staticData: { audience: "public" },
  component: ItemTree,
});
