import { useState } from "react";
import {
  Button,
  FormControlLabel,
  Grid,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import {
  useAddMaterialCostsToJob,
  useBuildMaterialPriceObject,
} from "../../../../../../Hooks/JobHooks/useAddMaterialCosts";
import { saveApplicationSettings } from "../../../../../../Functions/Endpoints/Pirivate/userDocument";
import MarketLocationSelect from "../../../../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../../../../Styled Components/Select/marketListing";
import { showSnackbarError } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { showShoppingList } from "../../../../../../Events/shoppingListEvents";
import { useGlobalDebounce } from "../../../../../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../../../../../Context/debounceKeys";
import importMultibuyFromClipboard from "../../../../../../Functions/Clipboard/importMultibuy";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function PurchasingDataPanel_EditJob(props) {
  const {
    state,
    actions,
    orderDisplay,
    marketDisplay,
    changeOrderDisplay,
    changeMarketDisplay,
  } = props;
  const hideCompleteMaterials = useUsersStore(
    (state) => state.applicationSettings.hideCompleteMaterials
  );
  const { toggleHideCompleteMaterials } =
    useUsersStore.getState().applicationSettings.actions;

  const [orderSelect, updateOrderSelect] = useState(orderDisplay);
  const [marketSelect, updateMarketSelect] = useState(marketDisplay);

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await saveApplicationSettings();
    },
    2000
  );

  const totalComplete = state.activeJob.totalCompletedMaterials();

  return (
    <ContentPanel>
      <Grid container align="center" width="100%">
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 6,
              md: 4,
            }}
          >
            <Typography sx={{ typography: { xs: "caption", sm: "body1" } }}>
              Total Complete Items: {totalComplete} /{" "}
              {state.activeJob.build.materials.length}
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 6,
              md: 4,
            }}
          >
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Total Material Cost:{" "}
              {formatNumberForLocale(
                state.activeJob.build.costs.totalPurchaseCost
              )}
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 6,
              md: 4,
            }}
          >
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Current Cost Per Item:{" "}
              {formatNumberForLocale(
                state.activeJob.build.costs.totalPurchaseCost /
                  state.activeJob.build.products.totalQuantity
              )}
            </Typography>
          </Grid>
        </Grid>
        <Grid container sx={{ marginTop: "20px" }} size={12}>
          <Grid
            sx={{ marginBottom: { xs: "20px", sm: "0px" } }}
            size={{
              xs: 12,
              md: 4,
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={hideCompleteMaterials}
                  onChange={async () => {
                    toggleHideCompleteMaterials();

                    debouncedSaveSettings();
                  }}
                />
              }
              label="Hide Completed Purchases"
              labelPlacement="start"
            />
          </Grid>{" "}
          <Grid
            container
            sx={{ marginBottom: { xs: "20px", sm: "0px" } }}
            size={{
              xs: 12,
              md: 4,
            }}
          >
            {totalComplete < state.activeJob.build.materials.length && (
              <Grid container size={12}>
                <Grid size={6}>
                  <Tooltip
                    title="Displays a shopping list of the remaining materials needed."
                    arrow
                  >
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        showShoppingList([state.activeJob.jobID]);
                      }}
                    >
                      Shopping List
                    </Button>
                  </Tooltip>
                </Grid>
                <Grid size={6}>
                  <Tooltip
                    title="Imports costs copied from the multibuy page in game."
                    arrow
                  >
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={async () => {
                        try {
                          const materialPriceObjects = [];
                          const matches = await importMultibuyFromClipboard();

                          for (let material of state.activeJob.build
                            .materials) {
                            const matchedItem = matches.find(
                              (i) => i.importedName === material.name
                            );
                            if (!matchedItem) continue;

                            materialPriceObjects.push(
                              useBuildMaterialPriceObject(
                                material.typeID,

                                "allRemaining",
                                matchedItem.importedCost
                              )
                            );
                          }

                          if (materialPriceObjects.length === 0) {
                            showSnackbarError("No Matching Items Found");
                            return;
                          }

                          const { newMaterialArray, newTotalPurchaseCost } =
                            useAddMaterialCostsToJob(
                              state.activeJob,
                              materialPriceObjects
                            );
                          state.activeJob.build.materials = newMaterialArray;
                          state.activeJob.build.costs.totalPurchaseCost =
                            newTotalPurchaseCost;
                          actions.updateActiveJob(state.activeJob);
                        } catch (error) {
                          console.error(
                            "Failed to import from clipboard:",
                            error
                          );
                          showSnackbarError(
                            error.message || "Failed to import from clipboard"
                          );
                        }
                      }}
                    >
                      Import Costs From Multibuy
                    </Button>
                  </Tooltip>
                </Grid>
              </Grid>
            )}
          </Grid>
          <Grid
            container
            size={{
              xs: 12,
              md: 4,
            }}
          >
            <Grid size={6}>
              <MarketLocationSelect
                value={marketSelect}
                onChange={(e) => {
                  changeMarketDisplay(e.id);
                  updateMarketSelect(e.id);
                  state.activeJob.layout.localMarketDisplay = e.id;
                  actions.updateActiveJob(state.activeJob);
                }}
                customFormStyling={{
                  width: "90px",
                  marginRight: "5px",
                }}
              />
            </Grid>
            <Grid size={6}>
              <MarketListingSelect
                value={orderSelect}
                onChange={(e) => {
                  changeOrderDisplay(e.id);
                  updateOrderSelect(e.id);
                  state.activeJob.layout.localOrderDisplay = e.id;
                  actions.updateActiveJob(state.activeJob);
                }}
                customFormStyling={{
                  width: "120px",
                  marginLeft: "5px",
                }}
              />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
