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
  MarketLocationSelectApplicationSettings,
} from "../../../../../../Styled Components/Select/marketLocation.jsx";
import {
  MarketListingSelectApplicationSettings,
} from "../../../../../../Styled Components/Select/marketListing.jsx";
import { showSnackbarError } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { showShoppingList } from "../../../../../../Events/shoppingListEvents";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import importMultibuyFromClipboard from "../../../../../../Functions/Clipboard/importMultibuy";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function PurchasingDataPanel_EditJob(props) {
  const { state, actions } = props;
  const hideCompleteMaterials = useUsersStore(
    (state) => state.applicationSettings.hideCompleteMaterials
  );
  const { toggleHideCompleteMaterials } =
    useUsersStore.getState().applicationSettings.actions;

  const totalComplete = state.activeJob.totalCompletedMaterials();

  return (
    <ContentPanel>
      <Grid container align="center" sx={{
        width: "100%"
      }}>
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
              {formatNumberForLocale(state.activeJob.totalMaterialCost())}
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
              Material Cost Per Item:{" "}
              {formatNumberForLocale(
                state.activeJob.totalMaterialCost() /
                  state.activeJob.totalQuantityProduced()
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

                    scheduleDebouncedApplicationSettingsSave();
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
                          const matches = await importMultibuyFromClipboard();
                          let matchedCount = 0;
                          let importedCount = 0;

                          for (let material of state.activeJob.build
                            .materials) {
                            const matchedItem = matches.find(
                              (i) => i.importedName === material.name
                            );
                            if (!matchedItem) continue;
                            matchedCount++;

                            const stillRequired =
                              material.quantityStillRequired();
                            if (stillRequired <= 0) continue;

                            const pastedQuantity =
                              Number(matchedItem.importedQuantity) || 0;
                            const { taken } = material.importPurchase({
                              itemCount:
                                pastedQuantity > 0
                                  ? pastedQuantity
                                  : stillRequired,
                              itemCost: matchedItem.importedCost,
                            });
                            if (taken > 0) importedCount++;
                          }

                          if (matchedCount === 0) {
                            showSnackbarError("No Matching Items Found");
                            return;
                          }

                          if (importedCount === 0) {
                            showSnackbarError("Nothing Left To Buy");
                            return;
                          }

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
              <MarketLocationSelectApplicationSettings
                overrideMarketLocation={
                  state.activeJob.layout.localMarketDisplay ?? undefined
                }
                onMarketLocationCommit={(id) => {
                  state.activeJob.layout.localMarketDisplay =
                    id === undefined ? null : id;
                  actions.updateActiveJob(state.activeJob);
                }}
                customFormStyling={{
                  width: "90px",
                  marginRight: "5px",
                }}
              />
            </Grid>
            <Grid size={6}>
              <MarketListingSelectApplicationSettings
                overrideOrderType={
                  state.activeJob.layout.localOrderDisplay ?? undefined
                }
                onOrderTypeCommit={(id) => {
                  state.activeJob.layout.localOrderDisplay =
                    id === undefined ? null : id;
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
