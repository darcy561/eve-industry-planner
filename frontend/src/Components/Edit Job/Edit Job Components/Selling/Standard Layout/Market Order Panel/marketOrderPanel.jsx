import { useState } from "react";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Box, Tab } from "@mui/material";
import { AvailableMarketOrdersTab } from "./availableOrdersTab";
import { LinkedMarketOrdersTab } from "./linkedMarketOrdersTab";
import { useQueryClient } from "@tanstack/react-query";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useGatherMarketOrdersAndUpdateExistingLinkedOrders } from "../../../../Hooks/useMarketOrdersAndWorldData";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function MarketOrderPanel(props) {
  const {
    state,
    actions,
    isLoading: parentIsLoading,
    isError: parentIsError,
    error: parentError,
  } = props;
  const [currentTab, updateTab] = useState(() =>
    state.activeJob.build.sale.marketOrders.length === 0 ? "1" : "0"
  );
  const queryClient = useQueryClient();
  const linkedOrders = useUsersStore((state) => state.account.linkedOrders);

  const {
    marketOrderMatches: itemOrderMatch,
    isWorldDataLoading,
    error: worldDataError,
  } = useGatherMarketOrdersAndUpdateExistingLinkedOrders(
    queryClient,
    state.activeJob,
    linkedOrders,
    state.esiDataToLink,
    actions
  );

  const isLoading = parentIsLoading || isWorldDataLoading;

  const isError = parentIsError || worldDataError;

  const error = parentError || worldDataError;

  const handleChange = (event, newValue) => {
    updateTab(newValue);
  };

  return (
    <ContentPanel
      wikiUrl="edit job/selling/market order panel"
      componentName="Market Order Panel"
      paperSx={{ minHeight: "30vh" }}
      isLoading={isLoading}
      isError={isError}
      error={error}
    >
      <TabContext value={currentTab}>
        <Box sx={{ width: "100%" }}>
          <TabList
            value={currentTab}
            onChange={handleChange}
            variant="fullWidth"
            textColor="secondary"
          >
            <Tab
              label={`${itemOrderMatch.length} Available Orders`}
              value="1"
            />
            <Tab
              label={`${state.activeJob.build.sale.marketOrders.length} Linked Orders`}
              value="0"
            />
          </TabList>
        </Box>
        <Box sx={{ width: "100%" }}>
          <TabPanel value="0">
            <LinkedMarketOrdersTab {...props} />
          </TabPanel>
          <TabPanel value="1">
            <AvailableMarketOrdersTab
              {...props}
              itemOrderMatch={itemOrderMatch}
            />
          </TabPanel>
        </Box>
      </TabContext>
    </ContentPanel>
  );
}
