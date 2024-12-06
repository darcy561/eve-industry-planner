import { useContext, useState } from "react";
import {
  Avatar,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { UsersContext } from "../../../../../../Context/AuthContext";
import { CorpEsiDataContext } from "../../../../../../Context/EveDataContext";
import { AddCustomTransactionDialog } from "./addCustomTransaction";
import { useHelperFunction } from "../../../../../../Hooks/GeneralHooks/useHelperFunctions";
import Job from "../../../../../../Classes/jobConstructor";

export function LinkedTransactionPanel({
  activeJob,
  updateActiveJob,
  setJobModified,
  activeOrder,
  esiDataToLink,
  updateEsiDataToLink,
}) {
  const { users } = useContext(UsersContext);
  const { corpEsiData } = useContext(CorpEsiDataContext);
  const [newTransactionTrigger, updateNewTransactionTrigger] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const { sendSnackbarNotificationError } = useHelperFunction();

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Paper
        sx={{
          padding: "20px",
          position: "relative",
        }}
        elevation={3}
        square={true}
      >
        <Grid container direction="row">
          <Grid container item xs={12} sx={{ marginBottom: "20px" }}>
            <Grid item xs={12}>
              <Typography variant="h5" color="primary" align="center">
                Linked Transactions
              </Typography>
            </Grid>

            <IconButton
              id="linkedTransactions_menu_button"
              onClick={handleMenuClick}
              aria-controls={
                Boolean(anchorEl) ? "linkedTransactions_menu" : undefined
              }
              aria-haspopup="true"
              aria-expanded={Boolean(anchorEl) ? "true" : undefined}
              sx={{ position: "absolute", top: "10px", right: "10px" }}
            >
              <MoreVertIcon size="small" color="primary" />
            </IconButton>
            <Menu
              id="linkedTransactions_menu"
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              MenuListProps={{
                "aria-labelledby": "linkedTransactions_menu_button",
              }}
            >
              <MenuItem
                onClick={() => {
                  updateNewTransactionTrigger(true);
                  setAnchorEl(null);
                }}
              >
                Add Manual Transaction
              </MenuItem>
            </Menu>
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
            {activeJob.build.sale.transactions.length !== 0 ? (
              activeJob.build.sale.transactions.map((tData, index) => {
                const charData = users.find(
                  (i) => i.CharacterHash === tData.CharacterHash
                );
                const corpData = corpEsiData.get(charData?.corporation_id);

                if (!activeOrder.some((t) => t !== tData.location_id)) {
                  return (
                    <Grid
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
                          })}
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
                          color="error"
                          onClick={() => {
                            let newTransArray = [
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

                            newTransArray.splice(index, 1);
                            newApiTransactions.delete(tData.transaction_id);
                            newDataToLink.delete(tData.transaction_id);
                            newDataToUnlink.add(tData.transaction_id);

                            updateEsiDataToLink((prev) => ({
                              ...prev,
                              transactions: {
                                ...prev.transactions,
                                add: [...newDataToLink],
                                remove: [...newDataToUnlink],
                              },
                            }));
                            activeJob.apiTransactions = newApiTransactions;
                            activeJob.build.sale.transactions = newTransArray;
                            updateActiveJob((prev) => new Job(prev));

                            sendSnackbarNotificationError("Unlinked");

                            setJobModified(true);
                          }}
                        >
                          <ClearIcon />
                        </IconButton>
                      </Grid>
                    </Grid>
                  );
                } else return null;
              })
            ) : (
              <Grid item xs={12} align="center">
                <Typography sx={{ typography: { xs: "caption", md: "body1" } }}>
                  There are currently no transactions linked to this market
                  order.
                </Typography>
              </Grid>
            )}
          </Grid>
        </Grid>
      </Paper>
      <AddCustomTransactionDialog
        activeJob={activeJob}
        updateActiveJob={updateActiveJob}
        setJobModified={setJobModified}
        newTransactionTrigger={newTransactionTrigger}
        updateNewTransactionTrigger={updateNewTransactionTrigger}
      />
    </>
  );
}
