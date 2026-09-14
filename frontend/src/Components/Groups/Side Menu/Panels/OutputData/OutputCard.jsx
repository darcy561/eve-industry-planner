import HighlightIcon from "@mui/icons-material/Highlight";
import {
  PRICING_SIDE,
  resolvePricingSide,
} from "../../../../../Functions/MarketData/pricingSide.js";
import {
  Avatar,
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

function OutputJobCard({ inputJob, state, actions }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { marketLocation: defaultMarket, listingType: defaultOrders } =
    resolvePricingSide({
      accountPricing: useUsersStore(
        (state) => state.applicationSettings.defaultPricing,
      ),
      side: PRICING_SIDE.SELLING,
    });

  const CurrentBuildCost =
    calculateCurrentJobBuildCostFromChildren(inputJob, {
      installCostMode: "actual",
    }) || 0;

  const currentMarketPrice =
    useUsersStore.getState().worldData.marketData[inputJob.itemID]?.[
      defaultMarket
    ]?.[defaultOrders] || 0;

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
              <Avatar
                src={`https://images.evetech.net/types/${inputJob.itemID}/icon?size=32`}
                alt={inputJob.name}
                variant="square"
                sx={{ height: 32, width: 32 }}
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
