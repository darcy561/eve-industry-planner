import { Grid } from "@mui/material";
import { useState } from "react";
import { CurrentMaterialHeader } from "./currentMaterialHeader";
import { MaterialCostRow_MaterialPricePanel } from "./itemRow";
import { MaterialTotals_MaterialPricesPanel } from "./materialTotals";
import { MaterialSourcesPopover } from "./materialSourcesPopover";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { useMaterialPricingModel } from "./Hooks/useMaterialPricingModel";
import { useMaterialOverrides } from "./Hooks/useMaterialOverrides";
import { useChildJobBuildActions } from "./Hooks/useChildJobBuildActions";

export function MaterialCostPanel(props) {
  const { state, actions } = props;
  const {
    activeJob,
    layout,
    marketSelect,
    listingSelect,
    materials,
    materialPriceOverrides,
    hasSetupToEdit,
    resolvedMaterials,
    totals,
  } = useMaterialPricingModel({ state, actions });
  const {
    updateLayoutPreference,
    updateMaterialLayoutPreference,
    clearAllMaterialLayoutPreferences,
    resetMaterialLayoutPreference,
    applyAllMaterialLayoutPreferences,
  } = useMaterialOverrides({
    activeJob,
    layout,
    materials,
    updateActiveJob: actions.updateActiveJob,
  });
  const { buildAllChildJobs } = useChildJobBuildActions({ state, actions });
  const [isMaterialSourcesOpen, setIsMaterialSourcesOpen] = useState(false);

  if (!hasSetupToEdit) return null;

  return (
    <ContentPanel
      title="Estimated Market Costs"
      paperSx={{ position: "relative", height: "auto" }}
      titleMarginBottom={6}
      enableMenu
      menuItems={[
        {
          label: "Manage Material Sources",
          onClick: () => {
            setIsMaterialSourcesOpen(true);
          },
        },
        {
          label: "Create All Child Jobs",
          onClick: buildAllChildJobs,
        },
      ]}
    >
      <CurrentMaterialHeader
        {...props}
        marketSelect={marketSelect}
        listingSelect={listingSelect}
      />
      <MaterialSourcesPopover
        marketSelect={marketSelect}
        listingSelect={listingSelect}
        marketOverride={layout.localMarketDisplay ?? null}
        listingOverride={layout.localOrderDisplay ?? null}
        onMarketLocationCommit={(id) => {
          updateLayoutPreference("localMarketDisplay", id ?? null);
        }}
        onOrderTypeCommit={(id) => {
          updateLayoutPreference("localOrderDisplay", id ?? null);
        }}
        materials={materials}
        materialPriceOverrides={materialPriceOverrides}
        onMaterialMarketCommit={(materialTypeID, id) =>
          updateMaterialLayoutPreference(materialTypeID, "marketDisplay", id ?? null)
        }
        onMaterialListingCommit={(materialTypeID, id) =>
          updateMaterialLayoutPreference(materialTypeID, "orderDisplay", id ?? null)
        }
        onResetMaterialOverride={resetMaterialLayoutPreference}
        onApplyAllMaterialsMarket={(id) =>
          applyAllMaterialLayoutPreferences("marketDisplay", id ?? null)
        }
        onApplyAllMaterialsListing={(id) =>
          applyAllMaterialLayoutPreferences("orderDisplay", id ?? null)
        }
        onClearAllMaterialOverrides={clearAllMaterialLayoutPreferences}
        materialSourcesAnchor={isMaterialSourcesOpen}
        onCloseMaterialSources={() => setIsMaterialSourcesOpen(false)}
      />
      <Grid container size={12}>
        {resolvedMaterials.map(
          ({ material, marketSelect: materialMarketSelect, listingSelect: materialListingSelect }) => {
          return (
            <MaterialCostRow_MaterialPricePanel
              {...props}
              key={material.typeID}
              material={material}
              marketSelect={materialMarketSelect}
              listingSelect={materialListingSelect}
            />
          );
        })}
        <MaterialTotals_MaterialPricesPanel
          state={state}
          totals={totals}
          listingSelect={listingSelect}
        />
      </Grid>
    </ContentPanel>
  );
}
