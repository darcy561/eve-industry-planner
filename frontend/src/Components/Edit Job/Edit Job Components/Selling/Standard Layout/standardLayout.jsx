import { useState } from "react";
import { Grid } from "@mui/material";

import { TutorialStep5 } from "../tutorialStep5";
import { MarketCostsPanel } from "./Market Costs Panel/marketCostsPanel";
import { MarketOrderPanel } from "./Market Order Panel/marketOrderPanel";
import { SalesStats } from "./Sales Stats Panel/salesStatsPanel";
import { AvailableTransactionsPanel } from "./Available Transactions Panel/availableTransactionsPanel";
import { LinkedTransactionPanel } from "./Linked Transaction Panel/linkedTransactionPanel";
import { Selling_ButtonPanel_EditJob } from "./Button Panel/buttonLayout";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";

export function Selling_StandardLayout_EditJob(props) {
  const [activeOrder, updateActiveOrder] = useState([]);

  return (
    <Grid container spacing={2}>
      <TutorialTemplate TutorialContent={<TutorialStep5 />} />
      <Grid size={12}>
        <MarketCostsPanel {...props} />
      </Grid>
      <Grid
        size={{
          xs: 12,
          md: 8
        }}>
        <MarketOrderPanel
          {...props}
          activeOrder={activeOrder}
          updateActiveOrder={updateActiveOrder}
        />
      </Grid>
      <Grid
        size={{
          xs: 12,
          md: 4
        }}>
        <SalesStats {...props} />
      </Grid>
      <Grid size={12}>
        <AvailableTransactionsPanel {...props} />
      </Grid>
      <Grid size={12}>
        <LinkedTransactionPanel {...props} activeOrder={activeOrder} />
      </Grid>
      <Grid size={12}>
        <Selling_ButtonPanel_EditJob {...props} />
      </Grid>
    </Grid>
  );
}
