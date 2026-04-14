import { useEffect } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid,
  Typography,
} from "@mui/material";
import { useShoppingList } from "../../../Hooks/GeneralHooks/useShoppingList";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../Context/defaultValues";
import { LoadingDataDisplay_ShoppingListDialog } from "./shoppingListLoading";
import { ListDataFrame_ShoppingListDialog } from "./shoppingListDataFrame";
import { AssetsFromClipboardButton_ShoppingList } from "./assetsFromClipboardButton";
import getMarketData from "../../../Functions/MarketData/findMarketData";
import useUsersStore from "../../../Zustand/usersStore";
import ShoppingList from "../../../Classes/shoppingList";
import UseAssetsButton_ShoppingList from "./useAssetsButton";
import SelectAssetLocation_ShoppingListDialog from "./assetLocationsSelection";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import writeTextToClipboard from "../../../Functions/Clipboard/writeTextToClipboard";
import { showSnackbarError } from "../../../Events/snackbarEvents";
import { useShoppingListCharacterAssets } from "./Hooks/useShoppingListCharacterAssets";
import { useShoppingListCorporationAssets } from "./Hooks/useShoppingListCorporationAssets";
export function ShoppingListDialogContent({
  state,
  actions,
  allCharacterAssetsLoading = undefined,
  allCharacterAssetsError = undefined,
  corporationAssetsLoading = undefined,
  corporationAssetsError = undefined,
}) {
  const { buildShoppingList } = useShoppingList();

  // Process character assets when enabled
  useShoppingListCharacterAssets({
    state,
    actions,
    allCharacterAssetsLoading,
  });

  // Process corporation assets when enabled
  useShoppingListCorporationAssets({
    state,
    actions,
    corporationAssetsLoading,
  });

  useEffect(() => {
    if (!state.isOpen || !state.buildingShoppingList) return;
    async function buildShoppingListObject() {
      actions.setIsLoading(true); // Start loading
      const shoppingListJobs = await buildShoppingList(state.requestedJobIDs);
      const shoppingList = new ShoppingList(shoppingListJobs);
      actions.setShoppingList(shoppingList);
      actions.toggleBuildingShoppingList();
    }
    buildShoppingListObject();
  }, [state.isOpen, state.buildingShoppingList]);

  useEffect(() => {
    async function createShoppingListDisplay() {
      if (!state.isOpen || state.buildingShoppingList) return;

      if (state.shoppingList) {
        const newItemPriceObjects = await getMarketData(
          state.shoppingList.getItemIDs()
        );
        state.shoppingList.calculateVisibleItems(state);
        state.shoppingList.calculateTotalVolume();
        state.shoppingList.calculateTotalValue(newItemPriceObjects);
        useUsersStore
          .getState()
          .worldData.actions.addMarketData(newItemPriceObjects);
        actions.setIsLoading(false); // Finish loading
      }
    }
    createShoppingListDisplay();
  }, [
    state.isOpen,
    state.buildingShoppingList,
    state.displayChildJobMaterials,
  ]);

  function handleClose() {
    actions.resetState();
  }

  return (
    <Dialog
      open={state.isOpen}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      sx={{
        "& .MuiDialog-paper": {
          maxHeight: "90vh",
          width: { xs: "95vw", sm: "90vw", md: "1200px" },
        },
      }}
    >
      <DialogTitle
        id="ShoppingListDialog"
        align="center"
        sx={{ marginBottom: "10px" }}
        color="primary"
      >
        Shopping List
      </DialogTitle>
      <DialogContent
        sx={{
          padding: "20px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          height: "calc(90vh - 200px)",
          maxHeight: "calc(90vh - 200px)",
        }}
      >
        <LoadingDataDisplay_ShoppingListDialog
          state={state}
          allCharacterAssetsError={allCharacterAssetsError}
          corporationAssetsError={corporationAssetsError}
        />
        <Grid
          container
          spacing={2}
          sx={{ flex: 1, overflow: "hidden", minHeight: 0 }}
        >
          {/* Left Column - List */}
          <Grid
            size={{ xs: 12, md: 8 }}
            sx={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minHeight: 0,
              height: "100%",
            }}
          >
            <Box
              sx={{
                flex: "1 1 auto",
                minHeight: 0,
                maxHeight: "100%",
                overflowY: "auto",
                overflowX: "hidden",
                paddingRight: "10px",
              }}
            >
              <ListDataFrame_ShoppingListDialog
                state={state}
                actions={actions}
              />
            </Box>
            {/* Total Volume and Value - Under the list, not scrollable */}
            {!state.isLoading && state.shoppingList && (
              <Box
                sx={{
                  flex: "0 0 auto",
                  flexShrink: 0,
                  marginTop: "20px",
                  paddingTop: "20px",
                  borderTop: "1px solid rgba(0,0,0,0.12)",
                }}
              >
                <Grid container>
                  <Grid size={4}>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                      Total Volume
                    </Typography>
                  </Grid>
                  <Grid align="right" size={8}>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                      {formatNumberForLocale(
                        state.shoppingList?.totalVolume ?? 0,
                        {
                          max: 0,
                        }
                      )}{" "}
                      m3
                    </Typography>
                  </Grid>
                </Grid>
                <Grid
                  container
                  sx={{ marginTop: "10px", marginBottom: "10px" }}
                >
                  <Grid size={4}>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                      Estimated Value
                    </Typography>
                  </Grid>
                  <Grid align="right" size={8}>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                      {formatNumberForLocale(
                        state.shoppingList?.totalValue ?? 0
                      )}{" "}
                      ISK
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Grid>
          {/* Right Column - Controls */}
          <Grid
            size={{ xs: 12, md: 4 }}
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              paddingLeft: { xs: 0, md: "20px" },
              borderLeft: { xs: "none", md: "1px solid rgba(0,0,0,0.12)" },
              paddingTop: { xs: "20px", md: 0 },
              borderTop: { xs: "1px solid rgba(0,0,0,0.12)", md: "none" },
              minHeight: 0,
            }}
          >
            {!state.isLoading && (
              <Box
                sx={{
                  display: { xs: "none", md: "flex" },
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                <FormGroup>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      "& > *": {
                        pointerEvents: "none",
                      },
                      "& .MuiCheckbox-root": {
                        pointerEvents: "auto",
                      },
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={state.displayChildJobMaterials}
                          onChange={() => {
                            actions.toggleDisplayChildJobMaterials();
                          }}
                        />
                      }
                      label={
                        <Typography
                          sx={{
                            typography: STANDARD_TEXT_FORMAT,
                          }}
                        >
                          Display Intermediary Items
                        </Typography>
                      }
                      labelPlacement="end"
                      sx={{
                        margin: 0,
                        pointerEvents: "none",
                        "& .MuiCheckbox-root": {
                          pointerEvents: "auto",
                        },
                      }}
                    />
                  </Box>
                </FormGroup>
                <UseAssetsButton_ShoppingList state={state} actions={actions} />
                <SelectAssetLocation_ShoppingListDialog
                  state={state}
                  actions={actions}
                />
                <AssetsFromClipboardButton_ShoppingList
                  actions={actions}
                  state={state}
                />
              </Box>
            )}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "row", md: "column" },
                gap: { xs: "10px", md: "20px" },
                marginTop: { xs: 0, md: "auto" },
                paddingTop: { xs: 0, md: "20px" },
                justifyContent: { xs: "space-between", md: "flex-end" },
                flexShrink: 0,
              }}
            >
              {state.shoppingList && (
                <Button
                  variant="contained"
                  size="small"
                  fullWidth={false}
                  sx={{
                    flex: { xs: 1, md: "none" },
                    fontSize: { xs: "0.75rem", md: "0.875rem" },
                    padding: { xs: "4px 8px", md: "6px 16px" },
                  }}
                  onClick={async () => {
                    try {
                      await writeTextToClipboard(
                        state.shoppingList.buildStringForClipboard()
                      );
                    } catch (error) {
                      // Handle clipboard permission errors gracefully
                      if (
                        error.message &&
                        error.message.includes("Clipboard")
                      ) {
                        showSnackbarError(
                          "Clipboard access denied. Please enable clipboard permissions in your browser settings.",
                          3
                        );
                        return;
                      }
                      console.error("Failed to copy to clipboard:", error);
                      showSnackbarError(
                        error.message || "Failed to copy to clipboard"
                      );
                    }
                  }}
                >
                  Copy Shopping List To Clipboard
                </Button>
              )}
              <Button
                variant="text"
                onClick={handleClose}
                autoFocus
                sx={{ flex: { xs: 0, md: "none" } }}
              >
                Close
              </Button>
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ display: "none" }}></DialogActions>
    </Dialog>
  );
}
