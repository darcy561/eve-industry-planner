import { useState, useEffect } from "react";
import { Box, Grid } from "@mui/material";
import { AccountData } from "./Components/AccountData";
import { NewTransactions } from "./Components/NewTransactions";
import { ArchivedStatsOverview } from "../Archive Statistics/ArchivedStatsOverview";
import { ArchivedItemBreakdown } from "../Archive Statistics/ArchivedItemBreakdown";
import { TutorialDashboard } from "./Components/dashboardTutorial";
import { ItemWatchPanel } from "./Components/ItemWatch/ItemWatchPanel";
import { ActiveCharacterSlots } from "./Components/characterSlots";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import PriceHistoryDialogue from "../Dialogues/Price History/dialogueFrame";
import MarketDataDialogue from "../Dialogues/Market Data/dialogueFrame";
import AssetsDialogue from "../Dialogues/Assets/dialogueFrame";
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
          <Grid container spacing={2}>
            <Grid size={12}>
              <ArchivedStatsOverview />
            </Grid>
            <Grid size={12}>
              <ArchivedItemBreakdown />
            </Grid>
            <Grid size={12}>
              <NewTransactions />
            </Grid>
          </Grid>
        </Grid>
        <Grid size={12}>
          <ItemWatchPanel />
        </Grid>
      </Grid>
      <PriceHistoryDialogue />
      <MarketDataDialogue />
      <AssetsDialogue />
    </DefaultPageLayout>
  );
}

export default Dashboard;
