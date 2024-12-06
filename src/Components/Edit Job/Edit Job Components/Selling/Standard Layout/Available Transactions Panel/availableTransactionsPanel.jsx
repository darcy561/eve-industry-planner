import { useContext } from "react";
import {
  Avatar,
  Button,
  Grid,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { getAnalytics, logEvent } from "firebase/analytics";
import {
  IsLoggedInContext,
  UsersContext,
} from "../../../../../../Context/AuthContext";
import { useMarketOrderFunctions } from "../../../../../../Hooks/GeneralHooks/useMarketOrderFunctions";
import { useHelperFunction } from "../../../../../../Hooks/GeneralHooks/useHelperFunctions";
import { CorpEsiDataContext } from "../../../../../../Context/EveDataContext";
import Job from "../../../../../../Classes/jobConstructor";

export function AvailableTransactionsPanel({
  activeJob,
  updateActiveJob,
  setJobModified,
  activeOrder,
  esiDataToLink,
  updateEsiDataToLink,
}) {
  const { users } = useContext(UsersContext);
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { corpEsiData } = useContext(CorpEsiDataContext);
  const { buildTransactionData } = useMarketOrderFunctions();
  const { findParentUserIndex, sendSnackbarNotificationSuccess } =
    useHelperFunction();
  const analytics = getAnalytics();

  const transactionData = buildTransactionData(
    activeJob,
    esiDataToLink.transactions.add
  );

  return (
    <Paper
      sx={{
        padding: "20px",
      }}
      elevation={3}
      square
    >
      <Grid container>
        <Grid container item xs={12} sx={{ marginBottom: "20px" }}>
          <Grid item xs={12}>
            <Typography variant="h5" color="primary" align="center">
              New Transactions
            </Typography>
          </Grid>
        </Grid>
        <Grid
          container
          item
          xs={12}
          sx={{
            overflowY: "auto",
            maxHeight: {
              xs: "350px",
              sm: "260px",
              md: "240px",
              lg: "240px",
              xl: "480px",
            },
          }}
        >
          {transactionData.length !== 0 ? (
            transactionData.map((tData) => {
              const charData = users.find(
                (i) => i.CharacterHash === tData.CharacterHash
              );
              const corpData = corpEsiData.get(charData?.corporation_id);
              return (
                <Grid
                  item
                  xs={12}
                  key={tData.transaction_id}
                  container
                  sx={{ marginBottom: "10px" }}
                >
                  <Grid item xs={1}>
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
                            ? corpData !== undefined
                              ? `https://images.evetech.net/corporations/${corpData.corporation_id}/logo`
                              : ""
                            : charData !== undefined
                            ? `https://images.evetech.net/characters/${charData.CharacterID}/portrait`
                            : ""
                        }
                        variant="circular"
                        sx={{
                          height: "32px",
                          width: "32px",
                        }}
                      />
                    </Tooltip>
                  </Grid>
                  <Grid
                    item
                    xs={11}
                    md={1}
                    align="center"
                    sx={{ marginBottom: { xs: "10px", sm: "0px" } }}
                  >
                    <Typography
                      sx={{ typography: { xs: "caption", sm: "body2" } }}
                    >
                      {new Date(tData.date).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={2} align="center">
                    <Typography
                      sx={{ typography: { xs: "caption", sm: "body2" } }}
                    >
                      {tData.description}
                    </Typography>
                  </Grid>
                  <Grid
                    item
                    xs={12}
                    md={2}
                    align="center"
                    sx={{ marginBottom: { xs: "10px", sm: "0px" } }}
                  >
                    <Typography
                      sx={{ typography: { xs: "caption", sm: "body2" } }}
                    >
                      {tData.quantity.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}{" "}
                      @{" "}
                      {tData.unit_price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3} align="center">
                    <Typography
                      sx={{ typography: { xs: "caption", sm: "body2" } }}
                    >
                      {tData.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                    </Typography>
                  </Grid>
                  <Grid
                    item
                    sm={6}
                    md={2}
                    align="center"
                    sx={{ display: { xs: "none", sm: "block" } }}
                  >
                    <Typography
                      sx={{ typography: { xs: "caption", sm: "body2" } }}
                    >
                      -
                      {tData.tax.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={1} align="center">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => {
                        let newTransactionArray = [
                          ...activeJob.build.sale.transactions,
                        ];
                        let newApiTransactions = new Set(
                          activeJob.apiTransactions
                        );

                        const newDataToLink = new Set(
                          esiDataToLink.transactions.add
                        );
                        const newDataToUnlink = new Set(
                          esiDataToLink.transactions.remove
                        );

                        if (activeJob.build.sale.marketOrders > 1) {
                          tData.order_id = activeOrder;
                        } else {
                          tData.order_id =
                            activeJob.build.sale.marketOrders[0].order_id;
                        }

                        newTransactionArray.push(tData);
                        newTransactionArray.sort((a, b) => {
                          return new Date(b.date) - new Date(a.date);
                        });

                        const parentUserIndex = findParentUserIndex();

                        newDataToLink.add(tData.transaction_id);
                        newDataToUnlink.delete(tData.transaction_id);

                        newApiTransactions.add(tData.transaction_id);

                        updateEsiDataToLink((prev) => ({
                          ...prev,
                          transactions: {
                            ...prev.transactions,
                            add: [...newDataToLink],
                            remove: [...newDataToUnlink],
                          },
                        }));
                        activeJob.apiTransactions = newApiTransactions;
                        activeJob.build.sale.transactions = newTransactionArray;
                        updateActiveJob((prev) => new Job(prev));
                        sendSnackbarNotificationSuccess("Linked");
                        setJobModified(true);

                        logEvent(analytics, "linkedTransaction", {
                          UID: users[parentUserIndex].accountID,
                          isLoggedIn: isLoggedIn,
                        });
                      }}
                    >
                      <AddIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              );
            })
          ) : (
            <Grid item xs={12} align="center">
              <Typography sx={{ typography: { xs: "caption", md: "body1" } }}>
                There are currently no new transactions matching your order to
                display, assign a new order or refresh the API data.
              </Typography>
            </Grid>
          )}
        </Grid>
        {transactionData.length > 1 && (
          <Grid item xs={12} align="right" sx={{ marginTop: "10px" }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => {
                let newTransactionArray = [
                  ...activeJob.build.sale.transactions,
                ];
                let newApiTransactions = new Set(activeJob.apiTransactions);

                const newDataToLink = new Set(esiDataToLink.transactions.add);
                const newDataToUnlink = new Set(
                  esiDataToLink.transactions.remove
                );
                const parentUserIndex = findParentUserIndex();

                for (let trans of transactionData) {
                  if (activeJob.build.sale.marketOrders > 1) {
                    trans.order_id = activeOrder;
                  } else {
                    trans.order_id =
                      activeJob.build.sale.marketOrders[0].order_id;
                  }
                  newTransactionArray.push(trans);
                  newApiTransactions.add(trans.transaction_id);

                  newDataToLink.add(trans.transaction_id);
                  newDataToUnlink.delete(trans.transaction_id);
                }
                newTransactionArray.sort((a, b) => {
                  return new Date(b.date) - new Date(a.date);
                });

                updateEsiDataToLink((prev) => ({
                  ...prev,
                  transactions: {
                    ...prev.transactions,
                    add: [...newDataToLink],
                    remove: [...newDataToUnlink],
                  },
                }));
                activeJob.apiTransactions = newApiTransactions;
                activeJob.build.sale.transactions = newTransactionArray;
                updateActiveJob((prev) => new Job(prev));
                sendSnackbarNotificationSuccess("All Transactions Linked");
                setJobModified(true);
                logEvent(analytics, "massLinkedTransactions", {
                  UID: users[parentUserIndex].accountID,
                  isLoggedIn: isLoggedIn,
                });
              }}
            >
              Link All
            </Button>
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}
