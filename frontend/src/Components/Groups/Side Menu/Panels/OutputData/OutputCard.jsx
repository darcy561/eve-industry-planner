import HighlightIcon from "@mui/icons-material/Highlight";
import { useMemo } from "react";
import { PRICING_SIDE } from "../../../../../Functions/MarketData/pricingSide.js";
import {
  resolveFor,
  sideDefaults,
} from "../../../../../Functions/MarketData/priceResolution";
import { getMarketPriceForType } from "../../../../../Functions/MarketData/marketPriceForType";
import {
  Card,
  CardActions,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { calculateCurrentJobBuildCostFromChildren } from "../../../../../Functions/Groups/calculateJobBuildCostFromChildren.js";
import findJobsToHighlight from "./findJobsToHighlight";
import useUsersStore from "../../../../../Zustand/usersStore";
import { RouterCardActionArea } from "../../../../../Styled Components/Navigation/routerControls.jsx";
import ItemMarketActions from "../../../../../Styled Components/Item/marketActions";
import { formatNumberForLocale } from "../../../../../Functions/Helper/numberParser";
import EveImageAvatar from "../../../../../Styled Components/Avatar/EveImageAvatar";

function OutputJobCard({ inputJob, state, actions }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const accountPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );

  const CurrentBuildCost =
    calculateCurrentJobBuildCostFromChildren(inputJob, {
      installCostMode: "actual",
    }) || 0;

  // The job's own choice included, because the group's fetch resolved it that
  // way: reading the account's market for a job that names another would read
  // an entry nobody asked for and show a zero.
  const currentMarketPrice = useMemo(() => {
    const { marketLocation, listingType } = resolveFor(
      sideDefaults(PRICING_SIDE.SELLING, {
        jobPricing: inputJob.layout?.localPricing,
        accountPricing,
      }),
      inputJob.layout,
      inputJob.itemID,
    );
    return getMarketPriceForType(inputJob.itemID, marketLocation, listingType);
  }, [inputJob.layout, inputJob.itemID, accountPricing]);

  const isHighlighted = state.highlightedItems.has(inputJob.jobID);

  return (
    <Card variant="elevation" square sx={{ marginBottom: "5px" }}>
      <RouterCardActionArea
        to="/editjob/$jobID"
        params={{ jobID: inputJob.jobID }}
        search={{
          activeGroup: activeGroupID,
          ...(state.pageView ? { pageView: state.pageView } : {}),
        }}
      >
        <CardContent>
          <Grid
            container
            spacing={1}
            sx={{
              alignItems: "center",
            }}
          >
            <Grid size={10}>
              <Typography variant="caption">{inputJob.name}</Typography>
            </Grid>
            <Grid size={2}>
              <EveImageAvatar
                type={inputJob.itemID}
                alt={inputJob.name}
                size={32}
                variant="square"
              />
            </Grid>
            <Grid size={12}>
              <Typography variant="caption">
                Quantity Produced:{" "}
                {formatNumberForLocale(inputJob.totalQuantityProduced, {
                  max: 0,
                })}
              </Typography>
            </Grid>
            <Grid size={12}>
              <Typography variant="caption">
                Current Item Build Cost:{" "}
                {formatNumberForLocale(CurrentBuildCost)}
              </Typography>
            </Grid>
            <Grid size={12}>
              <Typography variant="caption">
                Current Market Price:{" "}
                {formatNumberForLocale(currentMarketPrice)}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </RouterCardActionArea>
      <CardActions sx={{ justifyContent: "flex-end" }}>
        <Tooltip
          title="Highlight jobs within the production chain."
          arrow
          placement="left"
        >
          <IconButton
            size="small"
            color="primary"
            onClick={() => {
              if (state.highlightedItems.has(inputJob.jobID)) {
                actions.setHighlightedItems(new Set());
              } else {
                actions.setHighlightedItems(findJobsToHighlight(inputJob));
              }
            }}
          >
            <HighlightIcon color={isHighlighted ? "secondary" : "primary"} />
          </IconButton>
        </Tooltip>
        <ItemMarketActions
          typeID={inputJob.itemID}
          tooltipPlacement="left"
          side={PRICING_SIDE.SELLING}
        />
      </CardActions>
    </Card>
  );
}

export default OutputJobCard;
