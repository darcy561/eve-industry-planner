import HighlightIcon from "@mui/icons-material/Highlight";
import {
  Avatar,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useGroupManagement } from "../../../../../Hooks/useGroupManagement";
import { useNavigate } from "@tanstack/react-router";
import findJobsToHighlight from "./findJobsToHighlight";
import useUsersStore from "../../../../../Zustand/usersStore";
import MarketHistoryIconButton from "../../../../../Styled Components/IconButton/marketHistory";
import MarketDataIconButton from "../../../../../Styled Components/IconButton/marketData";
import { formatNumberForLocale } from "../../../../../Functions/Helper/numberParser";

function OutputJobCard({ inputJob, state, actions }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { calculateCurrentJobBuildCostFromChildren } = useGroupManagement();

  const defaultMarket = useUsersStore(
    (state) => state.applicationSettings.defaultMarketLocation
  );
  const defaultOrders = useUsersStore(
    (state) => state.applicationSettings.defaultOrderType
  );

  const navigate = useNavigate();

  const CurrentBuildCost =
    calculateCurrentJobBuildCostFromChildren(inputJob) || 0;

  const currentMarketPrice =
    useUsersStore.getState().worldData.marketData[inputJob.itemID]?.[
      defaultMarket
    ]?.[defaultOrders] || 0;

  const isHighlighted = state.highlightedItems.has(inputJob.jobID);

  return (
    <Card variant="elevation" square sx={{ marginBottom: "5px" }}>
      <CardActionArea
        onClick={() => {
          navigate({
            to: '/editjob/$jobID',
            params: { jobID: inputJob.jobID },
            search: { activeGroup: activeGroupID }
          });
        }}
      >
        <CardContent>
          <Grid container spacing={1} sx={{
            alignItems: "center"
          }}>
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
                {formatNumberForLocale(inputJob.build.products.totalQuantity, {
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
      </CardActionArea>
      <CardActions sx={{ justifyContent: "flex-end" }}>
        <Tooltip
          title="Highlight jobs within the production chain."
          arrow
          placement="left"
        >
          <IconButton
            size="small"
            color="primary"
            onClick={(event) => {
              if (state.highlightedItems.has(inputJob.jobID)) {
                actions.setHighlightedItems(new Set());
              } else {
                actions.setHighlightedItems(
                  findJobsToHighlight(inputJob)
                );
              }
            }}
          >
            <HighlightIcon color={isHighlighted ? "secondary" : "primary"} />
          </IconButton>
        </Tooltip>
        <MarketHistoryIconButton
          itemTypeID={inputJob.itemID}
          tooltipPlacement="left"
        />
        <MarketDataIconButton
          itemTypeID={inputJob.itemID}
          tooltipPlacement="left"
        />
      </CardActions>
    </Card>
  );
}

export default OutputJobCard;
