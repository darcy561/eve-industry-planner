import { Box, Grid, Typography } from "@mui/material";

import { useItemList, useItemSearchIndex } from "../../Hooks/Static/useItems";
import useGetAllIndustryJobs from "../../Hooks/EveEsi/useGetAllIndustryJobs";
import consolidateBlueprints from "../../Functions/Blueprints/consolidateBlueprints";
import { isAncientRelic } from "../../Functions/Shared/itemCategories";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import BlueprintCard, { BLUEPRINT_CARD_DENSITY } from "./blueprintCard";
import BlueprintGroupActions from "./blueprintGroupActions";

/**
 * Every blueprint of one type the account holds, as one panel.
 *
 * The two library views are the same panel at two densities: a roomy card grid, and a dense list.
 * What they show is identical, so the grouping and the card belong to both rather than to either.
 *
 * @param {{
 *   bpID: number,
 *   blueprintResults: {blueprints: Array<Object>},
 *   currentFilter?: string,
 *   locationNames?: Map<number, string>,
 *   compact?: boolean
 * }} props
 */
export default function BlueprintGroup({
  bpID,
  blueprintResults,
  currentFilter = "all",
  locationNames,
  compact = false,
}) {
  const {
    entries: blueprintIDs,
    isLoading: blueprintIDsLoading,
    error: blueprintIDsError,
  } = useItemSearchIndex();

  // Only for the type's category: a relic is drawn from its own image variant.
  const { records: itemRecords } = useItemList();

  const {
    data: apiJobs = [],
    isLoading: apiJobsLoading,
    error: apiJobsError,
  } = useGetAllIndustryJobs();

  const esiJobs = apiJobs.filter(
    (job) => job.product_type_id === bpID || job.blueprint_type_id === bpID,
  );

  const bpData = blueprintIDs?.find((item) => item.blueprintID === bpID);
  const held = blueprintResults.blueprints.filter((bp) => bp.typeId === bpID);

  const stacks = consolidateBlueprints(held, esiJobs);
  // The page keeps every blueprint of a type that has at least one active job, so under the active
  // filter the panel shows only the cards actually carrying one.
  const shown =
    currentFilter === "active"
      ? stacks.filter((stack) => stack.esiJob)
      : stacks;

  const density = compact
    ? BLUEPRINT_CARD_DENSITY.COMPACT
    : BLUEPRINT_CARD_DENSITY.STANDARD;

  return (
    // The page sets no maximum width, so a wide monitor fits more panels across rather than
    // stretching two of them over the whole screen.
    <Grid container size={{ xs: 12, sm: 6, lg: 4, xl: 3 }}>
      <AppShellPanel
        title={bpData?.name}
        componentName={`Blueprint Group - ${bpID}`}
        isLoading={blueprintIDsLoading || apiJobsLoading}
        isError={Boolean(blueprintIDsError || apiJobsError)}
        error={blueprintIDsError || apiJobsError}
        action={<BlueprintGroupActions bpData={bpData} />}
        paperSx={{ height: "auto" }}
        contentSx={{ overflow: "visible", minHeight: "auto" }}
      >
        {shown.length > 0 ? (
          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: density.columns,
            }}
          >
            {shown.map((stack) => (
              <BlueprintCard
                key={stack.key}
                stack={stack}
                bpData={bpData}
                locationName={locationNames?.get(stack.blueprint.itemId)}
                isRelic={isAncientRelic(
                  itemRecords[stack.blueprint.typeId]?.category_id,
                )}
                density={density}
              />
            ))}
          </Box>
        ) : (
          <Typography align="center" variant="body2" color="text.secondary">
            No Blueprints Owned
          </Typography>
        )}
      </AppShellPanel>
    </Grid>
  );
}
