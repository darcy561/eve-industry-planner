import { Box } from "@mui/material";
import TextInputFrame from "./textInputFrame";
import ReprocessingSetupPanel from "./reprocessingSetupPanel";
import OreSelectionPanel from "./oreSelectionPanel";
import PriceHistoryDialogue from "../Dialogues/Price History/dialogueFrame";
import MarketDataDialogue from "../Dialogues/Market Data/dialogueFrame";
import PanelFallBack from "../../Styled Components/Paper/panelStates";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
import PricingControls from "./pricingControls";
import ReprocessingHeadline from "./reprocessingHeadline";
import WhatYouGetPanel from "./whatYouGetPanel";
import ItemByItemPanel from "./itemByItemPanel";
import { useReprocessingSellingFees } from "./Hooks/useReprocessingSellingFees";
import useUsersStore from "../../Zustand/usersStore";
import PlaceholderPanel from "./placeholderPanel";
import AdvancedMineralOutput from "./advancedMineralOutput";
import DirectionPanel from "./directionPanel";
import useReprocessingReducer from "./Hooks/useReprocessingReducer";
import { useReprocessingAnswers } from "./Hooks/useReprocessingAnswers";
import AssetsDialogue from "../Dialogues/Assets/dialogueFrame";
import ContentErrorBoundary from "../../Styled Components/Paper/ContentErrorBoundary";

/** The Reprocessing page's columns: the reader's choices at the side, and what they come to in the main one. */
function ReprocessingColumns() {
  const {
    state,
    settings,
    skills,
    trainedSkills,
    skillsStatus,
    isPlannerHeld,
    actions,
  } = useReprocessingReducer();
  const isLoggedIn = useUsersStore((store) => store.account.isLoggedIn);
  const sellerHash = isLoggedIn ? state.sellerHash : null;
  const fees = useReprocessingSellingFees(state.marketLocation, sellerHash);
  const answers = useReprocessingAnswers(state, settings, skills, fees);
  const characters = useUsersStore((store) => store.account.characters);
  const sellerName = sellerHash
    ? characters?.find((character) => character.CharacterHash === sellerHash)
        ?.CharacterName
    : null;
  const { toMinerals } = answers;
  const view = {
    ...state,
    settings,
    toMinerals: false,
    reprocessingObjects: answers.reprocessingObjects,
    processedInput: [],
    requestedMinerals: answers.requestedMinerals,
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        alignItems: "flex-start",
        width: "100%",
      }}
    >
      <Box
        sx={{
          flex: "1 1 360px",
          maxWidth: { xs: "none", md: 400 },
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <DirectionPanel pageState={state} pageActions={actions} />
        <TextInputFrame
          pageState={state}
          pageActions={actions}
          answers={answers}
        />
        {toMinerals ? null : (
          <OreSelectionPanel
            settings={settings}
            isPlannerHeld={isPlannerHeld}
            actions={actions}
          />
        )}
        <ReprocessingSetupPanel
          pageState={state}
          pageActions={actions}
          skills={skills}
          trainedSkills={trainedSkills}
          skillsStatus={skillsStatus}
          answers={answers}
        />
      </Box>
      <Box
        sx={{
          flex: "999 1 640px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {answers.isPricing ? (
          <PanelFallBack isLoading loadingMessage="Gathering market data..." />
        ) : toMinerals ? (
          answers.valuation && answers.result.items.length > 0 ? (
            <>
              <ReprocessingHeadline
                pageState={state}
                pageActions={actions}
                result={answers.result}
                valuation={answers.valuation}
                orderTypeOptions={answers.orderTypeOptions}
                fees={fees}
                setup={answers.setup}
                sellerName={sellerName}
              />
              <WhatYouGetPanel
                result={answers.result}
                likelyOutputs={answers.likelyOutputs}
                valuation={answers.valuation}
                fees={fees}
                setup={answers.setup}
                marketLocation={state.marketLocation}
              />
              <ItemByItemPanel
                result={answers.result}
                valuation={answers.valuation}
                marketLocation={state.marketLocation}
                orderType={state.orderType}
              />
            </>
          ) : (
            <PlaceholderPanel />
          )
        ) : (
          <AppShellPanel
            title="Buying ore for these minerals"
            componentName="FromMineralsOutput"
            paperSx={{ height: "auto" }}
            action={<PricingControls pageState={state} pageActions={actions} />}
          >
            {answers.reprocessingObjects.length > 0 ? (
              <AdvancedMineralOutput pageState={view} pageActions={actions} />
            ) : (
              <PlaceholderPanel />
            )}
          </AppShellPanel>
        )}
      </Box>
    </Box>
  );
}

/** The Reprocessing page, its columns behind an error boundary that reports what broke them. */
function ReprocessingPage() {
  return (
    <>
      <ContentErrorBoundary componentName="Reprocessing Page">
        <ReprocessingColumns />
      </ContentErrorBoundary>
      <PriceHistoryDialogue />
      <MarketDataDialogue />
      <AssetsDialogue />
    </>
  );
}

export default ReprocessingPage;
