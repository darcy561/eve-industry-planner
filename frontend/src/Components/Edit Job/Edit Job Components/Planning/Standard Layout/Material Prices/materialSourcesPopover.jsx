import { Button, Divider, Grid, Popover, Typography } from "@mui/material";
import { useState } from "react";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { MarketLocationSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketLocation.jsx";
import { MarketListingSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketListing.jsx";

export function MaterialSourcesPopover({
  marketSelect,
  listingSelect,
  marketOverride,
  listingOverride,
  onMarketLocationCommit,
  onOrderTypeCommit,
  materials = [],
  materialPriceOverrides = {},
  onMaterialMarketCommit,
  onMaterialListingCommit,
  onResetMaterialOverride,
  onApplyAllMaterialsMarket,
  onApplyAllMaterialsListing,
  onClearAllMaterialOverrides,
  materialSourcesAnchor,
  onCloseMaterialSources,
}) {
  const [quickApplyMaterialListing, setQuickApplyMaterialListing] = useState(null);
  const [quickApplyMaterialMarket, setQuickApplyMaterialMarket] = useState(null);
  const centeredAnchorPosition =
    typeof window !== "undefined"
      ? {
          top: Math.round(window.innerHeight / 2),
          left: Math.round(window.innerWidth / 2),
        }
      : { top: 400, left: 600 };

  return (
    <Popover
      open={Boolean(materialSourcesAnchor)}
      anchorReference="anchorPosition"
      anchorPosition={centeredAnchorPosition}
      onClose={onCloseMaterialSources}
      transformOrigin={{ vertical: "center", horizontal: "center" }}
    >
      <Grid
        container
        sx={{
          p: 3,
          width: { xs: 360, sm: 700, md: 860 },
          maxHeight: "72vh",
          overflowY: "auto",
        }}
        spacing={1}
      >
        <Grid size={12}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Source settings
          </Typography>
        </Grid>
        <Grid size={12}>
          <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
            Current material
          </Typography>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <MarketListingSelectApplicationSettings
            overrideOrderType={listingOverride ?? undefined}
            onOrderTypeCommit={onOrderTypeCommit}
            customFormStyling={{ width: "100%" }}
            customHelperTextStyling={{ marginTop: "2px" }}
            labelText="Item Listing"
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <MarketLocationSelectApplicationSettings
            overrideMarketLocation={marketOverride ?? undefined}
            onMarketLocationCommit={onMarketLocationCommit}
            customFormStyling={{ width: "100%" }}
            customHelperTextStyling={{ marginTop: "2px" }}
            labelText="Item Market"
          />
        </Grid>
        <Grid size={12}>
          <Divider sx={{ my: 0.5 }} />
        </Grid>
        <Grid size={12}>
          <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
            Materials - quick apply
          </Typography>
        </Grid>
        <Grid size={{ xs: 6 }}>
          <MarketListingSelectApplicationSettings
            overrideOrderType={undefined}
            alternativeDefaultOrderType={
              quickApplyMaterialListing ?? listingSelect
            }
            onOrderTypeCommit={(id) => {
              const nextValue = id ?? null;
              setQuickApplyMaterialListing(nextValue);
              onApplyAllMaterialsListing?.(id);
            }}
            customFormStyling={{ width: "100%" }}
            customHelperTextStyling={{ marginTop: "2px" }}
            labelText="All Materials Listing"
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <MarketLocationSelectApplicationSettings
            overrideMarketLocation={undefined}
            alternativeDefaultMarketLocation={
              quickApplyMaterialMarket ?? marketSelect
            }
            onMarketLocationCommit={(id) => {
              const nextValue = id ?? null;
              setQuickApplyMaterialMarket(nextValue);
              onApplyAllMaterialsMarket?.(id);
            }}
            customFormStyling={{ width: "100%" }}
            customHelperTextStyling={{ marginTop: "2px" }}
            labelText="All Materials Market"
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <Button
            size="small"
            onClick={() => {
              setQuickApplyMaterialListing(null);
              onApplyAllMaterialsListing?.(undefined);
            }}
          >
            Reset listings to panel default
          </Button>
        </Grid>
        <Grid size={{ xs: 6 }} sx={{ textAlign: "right" }}>
          <Button
            size="small"
            onClick={() => {
              setQuickApplyMaterialMarket(null);
              onApplyAllMaterialsMarket?.(undefined);
            }}
          >
            Reset markets to panel default
          </Button>
        </Grid>
        <Grid size={12}>
          <Divider sx={{ my: 0.5 }} />
        </Grid>
        <Grid size={12}>
          <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
            Materials - individual overrides
          </Typography>
        </Grid>
        {materials.map((material) => {
          const override = materialPriceOverrides[material.typeID] || {};
          return (
            <Grid
              key={material.typeID}
              container
              size={12}
              spacing={1}
              sx={{ alignItems: "center", borderBottom: "1px solid", borderColor: "divider", py: 0.75 }}
            >
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  {material.name}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <MarketListingSelectApplicationSettings
                  overrideOrderType={override.orderDisplay ?? undefined}
                  alternativeDefaultOrderType={listingSelect}
                  onOrderTypeCommit={(id) =>
                    onMaterialListingCommit?.(material.typeID, id)
                  }
                  customFormStyling={{ width: "100%" }}
                  customHelperTextStyling={{ marginTop: "2px" }}
                  labelText="Listing"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <MarketLocationSelectApplicationSettings
                  overrideMarketLocation={override.marketDisplay ?? undefined}
                  alternativeDefaultMarketLocation={marketSelect}
                  onMarketLocationCommit={(id) =>
                    onMaterialMarketCommit?.(material.typeID, id)
                  }
                  customFormStyling={{ width: "100%" }}
                  customHelperTextStyling={{ marginTop: "2px" }}
                  labelText="Market"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 2 }} sx={{ textAlign: { sm: "right" } }}>
                <Button
                  size="small"
                  onClick={() => onResetMaterialOverride?.(material.typeID)}
                >
                  Default
                </Button>
              </Grid>
            </Grid>
          );
        })}
        <Grid size={12} sx={{ display: "flex", justifyContent: "flex-end", marginTop: 1 }}>
          <Button size="small" onClick={onClearAllMaterialOverrides}>
            Clear all material overrides
          </Button>
        </Grid>
      </Grid>
    </Popover>
  );
}
