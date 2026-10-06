import { createFileRoute } from "@tanstack/react-router";
import { primeReprocessing } from "../Functions/Static/reprocessing";
import { primeItems } from "../Functions/Static/items";
import { primeIndustryBonuses } from "../Functions/Static/industryBonuses";
import ReprocessingPage from "../Components/Reprocessing/reprocessingPage";

export const Route = createFileRoute("/reprocessing")({
  staticData: { audience: "public" },
  loader: () =>
    Promise.all([primeReprocessing(), primeItems(), primeIndustryBonuses()]),
  component: ReprocessingPage,
});
