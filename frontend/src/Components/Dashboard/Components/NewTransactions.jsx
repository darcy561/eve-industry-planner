import { Typography, Grid } from "@mui/material";

import { useMemo } from "react";
import { STANDARD_TEXT_FORMAT } from "../../../Context/defaultValues";
import { useCachedData } from "../../../Hooks/App/useCachedData";
import { CACHED_DATA_FILES } from "../../../Context/defaultValues";
import useUsersStore from "../../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import findTransactionsForMarketOrders from "../../../Functions/MarketOrders/findTransactionsForMarketOrders";
import findJournalEntriesFromTransaction from "../../../Functions/MarketOrders/findJournalEntriesFromTransaction";
import {
  getAllCachedCharacterMarketOrders,
  useGetAllCharacterMarketOrders,
} from "../../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders";
import {
  getAllCachedCharacterHistoricMarketOrders,
  useGetAllCharacterHistoricMarketOrders,
} from "../../../Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders";
import {
  getAllCachedCorporationMarketOrders,
  useGetAllCorporationMarketOrders,
} from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders";
import {
  getAllCachedCorporationHistoricMarketOrders,
  useGetAllCorporationHistoricMarketOrders,
} from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders";
import { useGetAllCharacterJournal } from "../../../Hooks/EveEsi/Character/useGetAllCharacterJournal";
import { useGetAllCorporationJournal } from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { formatDateForLocale, formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import { LAST_JOB_STATUS_ID } from "../../../Context/defaultValues";

export function NewTransactions() {
  const { jobArray } = useUsersStore((state) => state.jobData);
  const queryClient = useQueryClient();
  const linkedOrders = useUsersStore((state) => state.account.linkedOrders);
  const { data: itemData } = useCachedData(CACHED_DATA_FILES.SEARCH_INDEX);

  // Query states
  const characterMarketQuery = useGetAllCharacterMarketOrders();
  const characterHistoricQuery = useGetAllCharacterHistoricMarketOrders();
  const corporationMarketQuery = useGetAllCorporationMarketOrders();
  const corporationHistoricQuery = useGetAllCorporationHistoricMarketOrders();
  const characterJournalQuery = useGetAllCharacterJournal();
  const corporationJournalQuery = useGetAllCorporationJournal();

  // Combined loading and error states
  const isLoading =
    characterMarketQuery.isLoading ||
    characterHistoricQuery.isLoading ||
    corporationMarketQuery.isLoading ||
    corporationHistoricQuery.isLoading ||
    characterJournalQuery.isLoading ||
    corporationJournalQuery.isLoading;

  const isError =
    characterMarketQuery.isError ||
    characterHistoricQuery.isError ||
    corporationMarketQuery.isError ||
    corporationHistoricQuery.isError ||
    characterJournalQuery.isError ||
    corporationJournalQuery.isError;

  const error =
    characterMarketQuery.error ||
    characterHistoricQuery.error ||
    corporationMarketQuery.error ||
    corporationHistoricQuery.error ||
    characterJournalQuery.error ||
    corporationJournalQuery.error;

  // Process transaction data only when not loading and no errors
  const transactionData = useMemo(() => {
    if (isLoading || isError) {
      return [];
    }

    try {
      // Get cached data
      const characterMarketOrders =
        getAllCachedCharacterMarketOrders(queryClient)?.data || {};
      const characterHistoricOrders =
        getAllCachedCharacterHistoricMarketOrders(queryClient)?.data || {};
      const corporationMarketOrders =
        getAllCachedCorporationMarketOrders(queryClient)?.data || {};
      const corporationHistoricOrders =
        getAllCachedCorporationHistoricMarketOrders(queryClient)?.data || {};

      // Validate required data
      if (!jobArray || !Array.isArray(jobArray)) {
        return [];
      }

      // Get filtered jobs
      const filteredJobs = jobArray.filter(
        (job) => job?.jobStatus === LAST_JOB_STATUS_ID
      );

      if (filteredJobs.length === 0) {
        return [];
      }

      // Combine all market orders
      const allOrders = [
        ...Object.values(characterMarketOrders).flat().filter(Boolean),
        ...Object.values(characterHistoricOrders).flat().filter(Boolean),
        ...Object.values(corporationMarketOrders).flat().filter(Boolean),
        ...Object.values(corporationHistoricOrders).flat().filter(Boolean),
      ];

      const includedOrderIDs = new Set();
      const transactions = [];
      const matchedTransactionIDs = new Set();

      // Find matching orders
      const matchingOrders = allOrders.filter((order) => {
        if (!order?.type_id || !order?.order_id) return false;

        const correctItemType = filteredJobs.some(
          (job) => job?.itemID === order.type_id
        );
        const linkedToJoborGroup = linkedOrders.has(order.order_id);
        const isAlreadyIncluded = includedOrderIDs.has(order.order_id);

        if (correctItemType && linkedToJoborGroup && !isAlreadyIncluded) {
          includedOrderIDs.add(order.order_id);
          return true;
        }
        return false;
      });

      matchingOrders.forEach((order) => {
        try {
          const itemTrans = findTransactionsForMarketOrders(
            order,
            queryClient,
            matchedTransactionIDs
          );

          itemTrans?.forEach((trans) => {
            if (!trans?.transaction_id) return;

            try {
              const { journalEntry, transactionTax } =
                findJournalEntriesFromTransaction(trans, queryClient) || {};

              if (journalEntry && transactionTax) {
                transactions.push({
                  ...trans,
                  description: journalEntry.description,
                  tax: Math.abs(transactionTax.amount),
                });
                matchedTransactionIDs.add(trans.transaction_id);
              }
            } catch (transError) {
              console.warn("Error processing transaction:", transError);
            }
          });
        } catch (orderError) {
          console.warn("Error processing order:", orderError);
        }
      });

      // Sort by date (newest first)
      return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
      console.error("Error processing transaction data:", error);
      return [];
    }
  }, [
    isLoading,
    isError,
    jobArray,
    linkedOrders,
    queryClient,
  ]);

  return (
    <ContentPanel
      title="New Job Transactions"
      componentName="New Transactions"
      isLoading={isLoading}
      isError={isError}
      error={error}
    >
      {transactionData.length > 0 ? (
        <Grid
          container
          sx={{
            overflowY: "auto",
            maxHeight: { xs: "320px", md: "750px" },
          }}
          size={12}>
          {transactionData.map((trans) => {
            const itemName = itemData?.find((i) => i.itemID === trans.type_id);
            if (!itemName) return null;

            return (
              <Grid key={trans.transaction_id} container sixe={12} sx={{ marginBottom: "5px", width: "100%" }}>
                <Grid size={3}>
                  <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                    {formatDateForLocale(trans.date)}
                  </Typography>
                </Grid>
                <Grid size={4}>
                  <Typography
                    align="center"
                    sx={{ typography: STANDARD_TEXT_FORMAT }}
                  >
                    {itemName.name}
                  </Typography>
                </Grid>
                <Grid size={4}>
                  <Typography
                    align="right"
                    sx={{ typography: STANDARD_TEXT_FORMAT }}
                  >
                    {formatNumberForLocale(trans.quantity, { max: 0 })} @{" "}
                    {formatNumberForLocale(trans.unit_price)}
                  </Typography>
                </Grid>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <Grid sx={{ maxHeight: { xs: "320px", md: "750px" } }} size={12}>
          <Typography
            align="center"
            sx={{
              marginBottom: "10px",
              typography: STANDARD_TEXT_FORMAT,
            }}
          >
            There are currently no new transactions for your linked market
            orders within the ESI data.
          </Typography>
          <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Transaction data from the Eve ESI updates periodically, either
            refresh the current data or check back later.
          </Typography>
        </Grid>
      )}
    </ContentPanel>
  );
}
