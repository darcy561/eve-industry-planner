import { useState } from "react";
import {
  Avatar,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { AddCustomTransactionDialog } from "./addCustomTransaction";
import { showSnackbarError } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatDateForLocale, formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";

export function LinkedTransactionPanel(props) {
  const { state, actions, activeOrder } = props;
  const [newTransactionTrigger, updateNewTransactionTrigger] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const getCorporation =
    useUsersStore.getState().account.actions.getCorporation;

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <ContentPanel
      title="Linked Transactions"
      componentName="Linked Transaction Panel"
      paperSx={{ position: "relative" }}
    >
      <Grid container sx={{
        width: "100%"
      }}>
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
          slotProps={{
            list: {
              "aria-labelledby": "linkedTransactions_menu_button",
            }
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
            width: "100%",
          }}
          size={12}
          spacing={1}
        >
          {state.activeJob.build.sale.transactions.length !== 0 ? (
            state.activeJob.build.sale.transactions.map((tData, index) => {
              const charData = useUsersStore
                .getState()
                .account.actions.findCharacterByHash(tData.CharacterHash);

              const corpData = getCorporation(charData?.corporation_id);

              if (!activeOrder.some((t) => t !== tData.location_id)) {
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
                              ? corpData !== undefined
                                ? `https://images.evetech.net/corporations/${corpData.corporation_id}/logo`
                                : ""
                              : charData !== undefined
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
                        md: 1
                      }}>
                      <Typography
                        sx={{ typography: STANDARD_TEXT_FORMAT }}
                      >
                        {formatDateForLocale(tData.date)}
                      </Typography>
                    </Grid>
                    <Grid
                      align="center"
                      size={{
                        xs: 12,
                        md: 2
                      }}>
                      <Typography
                        sx={{ typography: STANDARD_TEXT_FORMAT }}
                      >
                        {tData.description}
                      </Typography>
                    </Grid>
                    <Grid
                      align="center"
                      size={{
                        xs: 12,
                        md: 2
                      }}>
                      <Typography
                        sx={{ typography: STANDARD_TEXT_FORMAT }}
                      >
                        {formatNumberForLocale(tData.quantity, { max: 0 })} @{" "}
                        {formatNumberForLocale(tData.unit_price)}
                      </Typography>
                    </Grid>
                    <Grid
                      align="center"
                      size={{
                        xs: 12,
                        sm: 6,
                        md: 3
                      }}>
                      <Typography
                        sx={{ typography: STANDARD_TEXT_FORMAT }}
                      >
                        {formatNumberForLocale(tData.amount)}
                      </Typography>
                    </Grid>
                    <Grid
                      align="center"
                      sx={{ display: { xs: "none", sm: "block" } }}
                      size={{
                        sm: 6,
                        md: 2
                      }}>
                      <Typography
                        sx={{ typography: STANDARD_TEXT_FORMAT }}
                      >
                        -{formatNumberForLocale(tData.tax)}
                      </Typography>
                    </Grid>
                    <Grid
                      align="center"
                      size={{
                        xs: 12,
                        md: 1
                      }}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          state.activeJob.removeTransaction(tData);
                          actions.addTransactionsForRemoval(
                            tData.transaction_id
                          );
                          actions.updateActiveJob(state.activeJob);
                          showSnackbarError("Unlinked");
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
            <Grid align="center" size={12}>
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                There are currently no transactions linked to this market
                order.
              </Typography>
            </Grid>
          )}
        </Grid>
      </Grid>
      <AddCustomTransactionDialog
        {...props}
        newTransactionTrigger={newTransactionTrigger}
        updateNewTransactionTrigger={updateNewTransactionTrigger}
      />
    </ContentPanel>
  );
}
