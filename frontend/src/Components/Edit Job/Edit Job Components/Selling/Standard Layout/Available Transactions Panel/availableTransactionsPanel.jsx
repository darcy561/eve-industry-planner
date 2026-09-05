import {
  Avatar,
  Button,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import findOrderTransactions from "../../../../../../Functions/MarketOrders/findOrderTransactions";
import {
  formatDateForLocale,
  formatNumberForLocale,
} from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import useGetAllCharacterTransactions from "../../../../../../Hooks/EveEsi/Character/useGetAllCharacterTransactions";
import { useGetAllCorporationTransactions } from "../../../../../../Hooks/EveEsi/Corporation/useGetAllCorporationTransactions";
import { useGetAllCharacterJournal } from "../../../../../../Hooks/EveEsi/Character/useGetAllCharacterJournal";
import { useGetAllCorporationJournal } from "../../../../../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal";
import { useGetAllCharacterMarketOrders } from "../../../../../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders";
import { useGetAllCharacterHistoricMarketOrders } from "../../../../../../Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders";
import { useGetAllCorporationMarketOrders } from "../../../../../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders";
import { useGetAllCorporationHistoricMarketOrders } from "../../../../../../Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";

export function AvailableTransactionsPanel({
  state,
  actions,
  activeOrder,
  isLoading,
  isError,
  error,
}) {
  const getCorporation =
    useUsersStore.getState().account.actions.getCorporation;
  const queryClient = useQueryClient();
  const jobLockReadOnly = useActiveJobReadOnly(state);
  // Subscribe to transaction and journal cache updates using React Query hooks
  // This ensures the component re-renders when transaction data updates
  const {
    data: characterTransactions = {},
    isLoading: isCharacterTransactionsLoading,
    isError: isCharacterTransactionsError,
    error: characterTransactionsError,
  } = useGetAllCharacterTransactions();
  const {
    data: corporationTransactions = {},
    isLoading: isCorporationTransactionsLoading,
    isError: isCorporationTransactionsError,
    error: corporationTransactionsError,
  } = useGetAllCorporationTransactions();
  const {
    data: characterJournal = {},
    isLoading: isCharacterJournalLoading,
    isError: isCharacterJournalError,
    error: characterJournalError,
  } = useGetAllCharacterJournal();
  const {
    data: corporationJournal = {},
    isLoading: isCorporationJournalLoading,
    isError: isCorporationJournalError,
    error: corporationJournalError,
  } = useGetAllCorporationJournal();

  // Subscribe to market order cache updates to trigger transaction search when orders update
  const { data: characterMarketOrders = {} } = useGetAllCharacterMarketOrders();
  const { data: characterHistoricMarketOrders = {} } =
    useGetAllCharacterHistoricMarketOrders();
  const { data: corporationMarketOrders = {} } =
    useGetAllCorporationMarketOrders();
  const { data: corporationHistoricMarketOrders = {} } =
    useGetAllCorporationHistoricMarketOrders();

  // Combine loading and error states from props (character data from LayoutSelector) and transaction/journal hooks
  const combinedIsLoading =
    isLoading ||
    isCharacterTransactionsLoading ||
    isCorporationTransactionsLoading ||
    isCharacterJournalLoading ||
    isCorporationJournalLoading;

  const combinedIsError =
    isError ||
    isCharacterTransactionsError ||
    isCorporationTransactionsError ||
    isCharacterJournalError ||
    isCorporationJournalError;

  const combinedError =
    error ||
    characterTransactionsError ||
    corporationTransactionsError ||
    characterJournalError ||
    corporationJournalError;

  // Memoize transaction data to recalculate when transaction/journal/market order cache updates
  // Market orders are included because findOrderTransactions searches for transactions matching the job's market orders
  // Only calculate when data is loaded to prevent errors from incomplete data
  const transactionData = useMemo(() => {
    // Don't run if data is still loading to prevent errors from incomplete data
    if (combinedIsLoading) {
      return [];
    }
    
    // Guard against missing job data
    if (!state.activeJob?.build?.sale?.marketOrders) {
      return [];
    }
    
    return findOrderTransactions(
      state.activeJob,
      queryClient,
      state.esiDataToLink.transactions.add,
      state.esiDataToLink.transactions.remove
    );
  }, [
    state.activeJob,
    state.activeJob?.build?.sale?.marketOrders?.length,
    queryClient,
    state.esiDataToLink.transactions.add,
    state.esiDataToLink.transactions.remove,
    characterTransactions,
    corporationTransactions,
    characterJournal,
    corporationJournal,
    characterMarketOrders,
    characterHistoricMarketOrders,
    corporationMarketOrders,
    corporationHistoricMarketOrders,
    combinedIsLoading, // Include loading state to prevent execution during updates
  ]);

  return (
    <ContentPanel
      title="New Transactions"
      componentName="Available Transactions Panel"
      isLoading={combinedIsLoading}
      isError={combinedIsError}
      error={combinedError}
    >
      <Grid container sx={{
        width: "100%"
      }}>
        <Grid
          container
          sx={{
            overflowY: "auto",

            maxHeight: {
              xs: 350,
              sm: 260,
              md: 240,
              lg: 240,
              xl: 480,
            },
          }}
          size={12}
          spacing={1}
        >
          {transactionData.length !== 0 ? (
            transactionData.map((tData) => {
              const charData = useUsersStore
                .getState()
                .account.actions.findCharacterByHash(tData.CharacterHash);
              const corpData = getCorporation(charData?.corporation_id);
              return (
                <Grid
                  key={tData.transaction_id}
                  container
                  size={12}
                  sx={{
                    alignItems: "center"
                  }}
                >
                  <Grid size={1}>
                    <Tooltip
                      title={
                        tData.is_corp
                          ? corpData?.name || "Unknown"
                          : charData?.CharacterName || "Unknown"
                      }
                      arrow
                      placement="right"
                    >
                      <Avatar
                        src={
                          tData.is_corp
                            ? corpData
                              ? `https://images.evetech.net/corporations/${corpData.corporation_id}/logo`
                              : ""
                            : charData
                              ? `https://images.evetech.net/characters/${charData.CharacterID}/portrait`
                              : ""
                        }
                        variant="circular"
                        sx={{
                          height: { xs: 24, sm: 32 },
                          width: { xs: 24, sm: 32 },
                        }}
                      />
                    </Tooltip>
                  </Grid>
                  <Grid
                    align="center"
                    size={{
                      xs: 11,
                      md: 1,
                    }}
                  >
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      {formatDateForLocale(tData.date)}
                    </Typography>
                  </Grid>
                  <Grid
                    align="center"
                    size={{
                      xs: 12,
                      md: 2,
                    }}
                  >
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      {tData.description}
                    </Typography>
                  </Grid>
                  <Grid
                    align="center"
                    size={{
                      xs: 12,
                      md: 2,
                    }}
                  >
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      {formatNumberForLocale(tData.quantity, { max: 0 })} @{" "}
                      {formatNumberForLocale(tData.unit_price)}
                    </Typography>
                  </Grid>
                  <Grid
                    align="center"
                    size={{
                      xs: 12,
                      sm: 6,
                      md: 3,
                    }}
                  >
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      {formatNumberForLocale(tData.amount)}
                    </Typography>
                  </Grid>
                  <Grid
                    align="center"
                    sx={{ display: { xs: "none", sm: "block" } }}
                    size={{
                      sm: 6,
                      md: 2,
                    }}
                  >
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      -{formatNumberForLocale(tData.tax)}
                    </Typography>
                  </Grid>
                  <Grid
                    align="center"
                    size={{
                      xs: 12,
                      md: 1,
                    }}
                  >
                    <Tooltip
                      title={
                        jobLockReadOnly
                          ? lockReasonText({
                              action: "linking transactions is disabled",
                            })
                          : ""
                      }
                      arrow
                      disableHoverListener={!jobLockReadOnly}
                    >
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          disabled={jobLockReadOnly}
                          onClick={() => {
                            if (jobLockReadOnly) return;
                            state.activeJob.addTransaction(tData, activeOrder);
                            actions.addTransactionsForAddition(
                              tData.transaction_id
                            );
                            actions.updateActiveJob(state.activeJob);
                            showSnackbarSuccess("Linked");
                          }}
                        >
                          <AddIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Grid>
                </Grid>
              );
            })
          ) : (
            <Grid align="center" size={12}>
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                There are currently no new transactions matching your order to
                display.
              </Typography>
            </Grid>
          )}
        </Grid>
        {transactionData.length > 1 && (
          <Grid align="right" sx={{ marginTop: 1 }} size={12}>
            <Tooltip
              title={
                jobLockReadOnly
                  ? lockReasonText({ action: "bulk linking is disabled" })
                  : ""
              }
              arrow
              disableHoverListener={!jobLockReadOnly}
            >
              <span>
                <Button
                  variant="contained"
                  size="small"
                  disabled={jobLockReadOnly}
                  onClick={() => {
                    if (jobLockReadOnly) return;
                    state.activeJob.addTransaction(transactionData, activeOrder);
                    actions.addTransactionsForAddition(
                      transactionData.map((trans) => trans.transaction_id)
                    );
                    actions.updateActiveJob(state.activeJob);
                    showSnackbarSuccess("All Transactions Linked");
                  }}
                >
                  Link All
                </Button>
              </span>
            </Tooltip>
          </Grid>
        )}
      </Grid>
    </ContentPanel>
  );
}
