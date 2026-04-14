import { useState, useEffect } from "react";
import { Box, Grid } from "@mui/material";
import { AccountData } from "./Components/AccountData";
import { NewTransactions } from "./Components/NewTransactions";
import { TutorialDashboard } from "./Components/dashboardTutorial";
import { ItemWatchPanel } from "./Components/ItemWatch/ItemWatchPanel";
import { ActiveCharacterSlots } from "./Components/characterSlots";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import PriceHistoryDialog from "../Dialogues/Price History/dialogFrame";
import MarketDataDialog from "../Dialogues/Market Data/dialogFrame";
import AssetsDialogue from "../Dialogues/Assets/dialogFrame";
import TutorialTemplate from "../Tutorials/tutorialTemplate";
import useUsersStore from "../../Zustand/usersStore";

function Dashboard() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const displayHelpCards = useUsersStore(
    (state) => state.applicationSettings.displayHelpCards
  );
  const shouldShowTutorial = !isLoggedIn || displayHelpCards;
  const [showTutorialGrid, setShowTutorialGrid] = useState(shouldShowTutorial);

  useEffect(() => {
    // Show the Grid when tutorials should be visible again
    if (shouldShowTutorial && !showTutorialGrid) {
      setShowTutorialGrid(true);
    }
  }, [shouldShowTutorial, showTutorialGrid]);

  return (
    <DefaultPageLayout>
      <Grid container size={12} spacing={2}>
        {showTutorialGrid && (
          <Grid size={12}>
            <TutorialTemplate
              TutorialContent={<TutorialDashboard />}
              onFadeOutComplete={() => setShowTutorialGrid(false)}
            />
          </Grid>
        )}
        <Grid
          container
          size={{
            xs: 12,
            md: 6,
            lg: 4,
          }}
          spacing={2}
        >
          <Grid size={12}>
            <AccountData />
          </Grid>
          <Grid size={12}>
            <ActiveCharacterSlots />
          </Grid>
        </Grid>
        <Grid
          size={{
            xs: 12,
            md: 6,
            lg: 8,
          }}
        >
          <NewTransactions />
        </Grid>
        <Grid size={12}>
          <ItemWatchPanel />
        </Grid>
      </Grid>
      <PriceHistoryDialog />
      <MarketDataDialog />
      <AssetsDialogue />
    </DefaultPageLayout>
  );
}

export default Dashboard;
