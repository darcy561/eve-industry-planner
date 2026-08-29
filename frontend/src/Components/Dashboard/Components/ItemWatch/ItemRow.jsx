import {
  FormControl,
  FormHelperText,
  Grid,
  Icon,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ClearIcon from "@mui/icons-material/Clear";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { putWatchlistDeprecatedToApi } from "../../../../Functions/Endpoints/Private/watchlistDeprecated.js";
import { AppEvent } from "../../../../analytics/appEventNames";
import { trackAppEvent } from "../../../../analytics/trackAppEvent";
import { ExpandedWatchlistRow } from "./ItemRowExpanded";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useQueryClient } from "@tanstack/react-query";
import { showSnackbarError } from "../../../../Events/snackbarEvents";
import useUsersStore from "../../../../Zustand/usersStore";
import MaterialPopoverIconButtons from "../../../../Styled Components/Popover/iconButtons";
import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";
import { calculateInstallCostfromSetup } from "../../../../Functions/Installation Costs/installCosts";
import addNewJobsToPlanner from "../../../../Functions/JobPlanner/addNewJobsToPlanner";

export function WatchListRow({
  item,
  index,
  setOpenDialogue,
  updateWatchlistItemToEdit,
}) {
  const [expanded, setExpanded] = useState(false);
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const { setUserWatchlistItems } = useUsersStore.getState().jobData.actions;

  const defaultMarket = useUsersStore(
    (state) => state.applicationSettings.defaultMarketLocation
  );
  const defaultOrders = useUsersStore(
    (state) => state.applicationSettings.defaultOrderType
  );
  const marketData = useUsersStore((state) => state.worldData.marketData);

  const { getCustomStructureWithID } =
    useUsersStore.getState().applicationSettings.actions;

  const { findMarketData } = useUsersStore.getState().worldData.actions;

  const queryClient = useQueryClient();
  async function handleRemove() {
    let newUserWatchlistItems = [...userWatchlist.items];
    newUserWatchlistItems.splice(index, 1);
    setUserWatchlistItems(newUserWatchlistItems);
    await putWatchlistDeprecatedToApi(userWatchlist.groups, newUserWatchlistItems);
    trackAppEvent(AppEvent.REMOVE_WATCHLIST_ITEM);
    showSnackbarError(`${item.name} Removed`, 3);
  }

  async function handleAdd() {
    await addNewJobsToPlanner([{ itemID: item.typeID }], queryClient);
  }

  const buildCosts = useCallback(() => {
    const mainItemPrice = findMarketData(item.typeID);

    let totalBuild = calculateInstallCostfromSetup(item?.buildData);
    let totalPurchase = calculateInstallCostfromSetup(item?.buildData);

    item.materials.forEach((mat) => {
      const itemPrice = findMarketData(mat.typeID);

      totalPurchase += itemPrice[defaultMarket][defaultOrders] * mat.quantity;

      if (mat.materials.length === 0) {
        totalBuild += itemPrice[defaultMarket][defaultOrders] * mat.quantity;
        return;
      }
      let matBuild = calculateInstallCostfromSetup(mat?.buildData);
      mat.materials.forEach((cMat) => {
        let itemCPrice = findMarketData(cMat.typeID);
        matBuild += itemCPrice[defaultMarket][defaultOrders] * cMat.quantity;
      });

      matBuild = matBuild / mat.quantityProduced;
      totalBuild += matBuild * mat.quantity;
    });
    totalPurchase = totalPurchase / item.quantity;
    totalBuild = totalBuild / item.quantity;
    return {
      totalBuild: totalBuild,
      totalPurchase: totalPurchase,
      mainItemPrice: mainItemPrice,
    };
  }, [marketData]);

  const isItemDataOutdated = !item?.buildData;

  const isStructureMissing = !getCustomStructureWithID(
    item?.buildData?.customStructureID
  );

  const calculatedCosts = buildCosts();

  return (
    <Grid container size={12}>
      <Paper
        square
        sx={{
          width: "100%",
          marginBottom: "1px",
          padding: " 10px 20px",
        }}
      >
        <Grid container size={12}>
          <Grid
            size={{
              xs: 2,
              sm: 1
            }}
            sx={{
              justifyContent: "center",
              alignItems: "center",
              display: "flex"
            }}>
            {isItemDataOutdated || isStructureMissing ? (
              <Tooltip
                title={
                  isItemDataOutdated
                    ? "Outdated watchlist item, the values calculated may no longer be accurate. Edit this item or replace it to correct."
                    : "The custom structure used to calculate the install costs is missing, Edit this item to update the structure."
                }
                arrow
                placement="bottom"
              >
                <Icon color={isItemDataOutdated ? "error" : "warning"}>
                  <WarningAmberIcon />
                </Icon>
              </Tooltip>
            ) : (
              <img
                src={`https://images.evetech.net/types/${item.typeID}/icon?size=32`}
                alt=""
              />
            )}
          </Grid>
          <Grid
            container
            size={{
              xs: 10,
              sm: 2,
              lg: 2
            }}
            sx={{
              alignItems: "center",
              marginBottom: { xs: "20px", sm: "0px" }
            }}>
            <MaterialPopoverIconButtons typeID={item.typeID}>
              <Typography sx={{ typography: { xs: "subtitle2", sm: "body2" } }}>
                {item.name}
              </Typography>
            </MaterialPopoverIconButtons>
          </Grid>
          <Grid
            container
            size={{
              xs: 12,
              sm: 3,
              lg: 2
            }}
            sx={{
              justifyContent: "center",
              alignItems: "center",

              color:
                calculatedCosts.mainItemPrice[defaultMarket].sell !== 0
                  ? "none"
                  : "success.main",

              marginBottom: { xs: "5px", sm: "0px" }
            }}>
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              {formatNumberForLocale(
                calculatedCosts.mainItemPrice[defaultMarket].sell
              )}
            </Typography>
          </Grid>
          <Grid
            sx={{ marginBottom: { xs: "5px", sm: "0px" } }}
            size={{
              xs: 12,
              sm: 3,
              lg: 3
            }}>
            <Grid
              container
              size={12}
              sx={{
                justifyContent: "center",
                alignItems: "center"
              }}>
              <Typography
                sx={{
                  typography: { xs: "caption", sm: "body2" },
                  color:
                    calculatedCosts.totalPurchase <
                    calculatedCosts.mainItemPrice[defaultMarket].sell
                      ? calculatedCosts.totalBuild <
                        calculatedCosts.totalPurchase
                        ? "warning.main"
                        : "success.main"
                      : "error.main",
                }}
              >
                {formatNumberForLocale(calculatedCosts.totalPurchase)}
              </Typography>
            </Grid>
            <Grid
              container
              size={12}
              sx={{
                justifyContent: "center",
                alignItems: "center"
              }}>
              <Tooltip
                title={formatNumberForLocale(
                  ((calculatedCosts.totalPurchase -
                    calculatedCosts.mainItemPrice[defaultMarket].sell) /
                    calculatedCosts.totalPurchase) *
                    100,
                  { min: 0, max: 4 }
                )}
                arrow
                placement="bottom"
              >
                <Typography
                  sx={{
                    typography: "caption",
                    color:
                      calculatedCosts.totalPurchase <
                      calculatedCosts.mainItemPrice[defaultMarket].sell
                        ? calculatedCosts.totalBuild <
                          calculatedCosts.totalPurchase
                          ? "warning.main"
                          : "success.main"
                        : "error.main",
                  }}
                >
                  {formatNumberForLocale(
                    ((calculatedCosts.totalPurchase -
                      calculatedCosts.mainItemPrice[defaultMarket].sell) /
                      calculatedCosts.totalPurchase) *
                      100,
                    { min: 0, max: 0 }
                  )}
                  %
                </Typography>
              </Tooltip>
            </Grid>
          </Grid>
          <Grid
            container
            sx={{ marginBottom: { xs: "5px", sm: "0px" } }}
            size={{
              xs: 12,
              sm: 3,
              lg: 3
            }}>
            {!item.childJobPresent && (
              <Grid
                container
                size={12}
                sx={{
                  justifyContent: "center",
                  alignItems: "center"
                }}>
                <Typography
                  align="center"
                  sx={{
                    typography: { xs: "caption", sm: "body2" },
                  }}
                >
                  N/A
                </Typography>
              </Grid>
            )}
            {item.childJobPresent && (
              <>
                <Grid
                  container
                  size={12}
                  sx={{
                    justifyContent: "center",
                    alignItems: "center"
                  }}>
                  <Typography
                    align="center"
                    sx={{
                      typography: { xs: "caption", sm: "body2" },
                      color:
                        calculatedCosts.totalBuild <
                        calculatedCosts.mainItemPrice[defaultMarket].sell
                          ? calculatedCosts.totalBuild >
                            calculatedCosts.totalPurchase
                            ? "orange"
                            : "success.main"
                          : "error.main",
                    }}
                  >
                    {formatNumberForLocale(calculatedCosts.totalBuild)}
                  </Typography>
                </Grid>
                <Grid
                  container
                  size={12}
                  sx={{
                    justifyContent: "center",
                    alignItems: "center"
                  }}>
                  <Tooltip
                    title={formatNumberForLocale(
                      ((calculatedCosts.totalBuild -
                        calculatedCosts.mainItemPrice[defaultMarket].sell) /
                        calculatedCosts.totalBuild) *
                        100,
                      { min: 0, max: 4 }
                    )}
                    arrow
                    placement="bottom"
                  >
                    <Typography
                      align="center"
                      sx={{
                        typography: { xs: "caption", sm: "body2" },
                        color:
                          calculatedCosts.totalBuild <
                          calculatedCosts.mainItemPrice[defaultMarket].sell
                            ? calculatedCosts.totalBuild >
                              calculatedCosts.totalPurchase
                              ? "orange"
                              : "success.main"
                            : "error.main",
                      }}
                    >
                      {formatNumberForLocale(
                        ((calculatedCosts.totalBuild -
                          calculatedCosts.mainItemPrice[defaultMarket].sell) /
                          calculatedCosts.totalBuild) *
                          100
                      )}
                      %
                    </Typography>
                  </Tooltip>
                </Grid>
              </>
            )}
          </Grid>
          <Grid
            align="center"
            sx={{ display: { xs: "none", lg: "flex" } }}
            size={{
              xs: 12,
              sm: 1
            }}>
            <Tooltip
              title="Remove Item From Watchlist"
              arrow
              placement="bottom"
            >
              <IconButton color="error" onClick={handleRemove}>
                <ClearIcon />
              </IconButton>
            </Tooltip>
          </Grid>
          {!expanded ? (
            <Grid align="center" size={12}>
              <Tooltip title="More Information" arrow placement="bottom">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => {
                    setExpanded((prev) => !prev);
                  }}
                >
                  <ExpandMoreIcon />
                </IconButton>
              </Tooltip>
            </Grid>
          ) : (
            <>
              <Grid
                container
                spacing={1}
                sx={{
                  marginBottom: "20px",
                  marginTop: "20px",
                  position: "relative",
                }}
                size={12}>
                {item.materials.map((mat) => {
                  return (
                    <ExpandedWatchlistRow
                      key={mat.id}
                      mat={mat}
                    />
                  );
                })}
              </Grid>
              <Grid container sx={{ marginTop: "10px" }} size={12}>
                <Grid size={2}>
                  <FormControl
                    fullWidth
                    sx={{
                      "& .MuiFormHelperText-root": {
                        color: (theme) => theme.palette.secondary.main,
                      },
                      "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                        {
                          display: "none",
                        },
                    }}
                  >
                    <Select
                      variant="standard"
                      size="small"
                      value={item.group}
                      onChange={(e) => {
                        let newUserWatchlistItems = [...userWatchlist.items];

                        newUserWatchlistItems[index].group = e.target.value;
                        setUserWatchlistItems(newUserWatchlistItems);
                        void putWatchlistDeprecatedToApi(
                          userWatchlist.groups,
                          newUserWatchlistItems
                        );
                      }}
                    >
                      <MenuItem value={0}>None</MenuItem>
                      {userWatchlist.groups.map((entry) => {
                        return (
                          <MenuItem key={entry.id} value={entry.id}>
                            {entry.name}
                          </MenuItem>
                        );
                      })}
                    </Select>
                    <FormHelperText variant="standard">
                      Watchlist Group
                    </FormHelperText>
                  </FormControl>
                </Grid>
                <Grid sx={{ paddingLeft: "10px" }} size={6}>
                  <Tooltip
                    title="Create a new job on the Job Planner."
                    arrow
                    placement="bottom"
                  >
                    <IconButton color="primary" onClick={handleAdd}>
                      <AddIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit Watchlist Item" arrow placement="bottom">
                    <IconButton
                      color="primary"
                      onClick={() => {
                        setOpenDialogue(true);
                        updateWatchlistItemToEdit(index);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                </Grid>
                <Grid align="right" size={4}>
                  <Tooltip
                    title="Remove Item From Watchlist"
                    arrow
                    placement="bottom"
                  >
                    <IconButton
                      size="small"
                      color="error"
                      onClick={handleRemove}
                      sx={{
                        display: { lg: "none" },
                      }}
                    >
                      <ClearIcon />
                    </IconButton>
                  </Tooltip>
                </Grid>
              </Grid>
              <Grid align="center" sx={{ marginTop: "5px" }} size={12}>
                <Tooltip title="Less Information" arrow placement="bottom">
                  <IconButton
                    color="primary"
                    onClick={() => {
                      setExpanded((prev) => !prev);
                    }}
                  >
                    <ExpandLessIcon />
                  </IconButton>
                </Tooltip>
              </Grid>
            </>
          )}
        </Grid>
      </Paper>
    </Grid>
  );
}
