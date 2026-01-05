import { useState } from "react";
import { Typography, Grid } from "@mui/material";
import { CurrentMaterialHeader } from "./currentMaterialHeader";
import { MaterialCostRow_MaterialPricePanel } from "./itemRow";
import { MaterialTotals_MaterialPricesPanel } from "./materialTotals";
import MarketLocationSelect from "../../../../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../../../../Styled Components/Select/marketListing";
import useUsersStore from "../../../../../../Zustand/usersStore";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function MaterialCostPanel(props) {
  const { state, actions } = props;

  const defaultMarket = useUsersStore(
    (state) => state.applicationSettings.defaultMarket
  );
  const defaultOrders = useUsersStore(
    (state) => state.applicationSettings.defaultOrders
  );

  const [marketSelect, updateMarketSelect] = useState(
    state.activeJob.layout.localMarketDisplay || defaultMarket
  );
  const [listingSelect, updateListingSelect] = useState(
    state.activeJob.layout.localOrderDisplay || defaultOrders
  );

  if (!state.activeJob.build.setup[state.activeJob.layout.setupToEdit])
    return null;

  return (
    <ContentPanel
      title="Estimated Market Costs"
      paperSx={{ position: "relative", height: "auto" }}
      titleMarginBottom={6}
    >
      <MarketListingSelect
        value={listingSelect}
        customFormStyling={{
          width: "120px",
          position: "absolute",
          top: { xs: "55px", sm: "20px" },
          left: { xs: "10%", sm: "30px" },
        }}
        onChange={(e) => {
          state.activeJob.layout.localOrderDisplay = e.id;
          actions.updateActiveJob(state.activeJob);
          updateListingSelect(e.id);
        }}
      />
      <MarketLocationSelect
        value={marketSelect}
        onChange={(e) => {
          state.activeJob.layout.localMarketDisplay = e.id;
          actions.updateActiveJob(state.activeJob);
          updateMarketSelect(e.id);
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
