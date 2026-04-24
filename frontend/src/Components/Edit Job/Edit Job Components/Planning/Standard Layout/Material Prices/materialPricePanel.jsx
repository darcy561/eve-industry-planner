import { Typography, Grid } from "@mui/material";
import { CurrentMaterialHeader } from "./currentMaterialHeader";
import { MaterialCostRow_MaterialPricePanel } from "./itemRow";
import { MaterialTotals_MaterialPricesPanel } from "./materialTotals";
import { MarketLocationSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketLocation.jsx";
import { MarketListingSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketListing.jsx";
import { useEffectiveMarketHubFromLayout } from "../../../../../../Hooks/Planner/useEffectiveMarketHubFromLayout.js";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function MaterialCostPanel(props) {
  const { state, actions } = props;

  const { marketDisplay: marketSelect, orderDisplay: listingSelect } =
    useEffectiveMarketHubFromLayout(state.activeJob.layout);

  if (!state.activeJob.build.setup[state.activeJob.layout.setupToEdit])
    return null;

  return (
    <ContentPanel
      title="Estimated Market Costs"
      paperSx={{ position: "relative", height: "auto" }}
      titleMarginBottom={6}
    >
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
          position: "absolute",
          top: { xs: "55px", sm: "20px" },
          left: { xs: "10%", sm: "30px" },
        }}
      />
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
          position: "absolute",
          top: { xs: "55px", sm: "20px" },
          right: { xs: "10%", sm: "30px" },
        }}
      />
      <CurrentMaterialHeader
        {...props}
        marketSelect={marketSelect}
        listingSelect={listingSelect}
      />
      <Grid container size={12}>
        {state.activeJob.build.materials.map((material) => {
          return (
            <MaterialCostRow_MaterialPricePanel
              {...props}
              key={material.typeID}
              material={material}
              marketSelect={marketSelect}
              listingSelect={listingSelect}
            />
          );
        })}
        <MaterialTotals_MaterialPricesPanel
          {...props}
          marketSelect={marketSelect}
          listingSelect={listingSelect}
        />
      </Grid>
    </ContentPanel>
  );
}
