import { Box, Fade } from "@mui/material";
import TextInputFrame from "./textInputFrame";
import ReprocessingStructurePanel from "./reprocessingStructurePanel";
import BasicMineralOutput from "./basicMineralOutput";
import PriceHistoryDialogue from "../Dialogues/Price History/dialogueFrame";
import MarketDataDialogue from "../Dialogues/Market Data/dialogueFrame";
import DisplayLoadingPanel from "./loadingPanel";
import OptionsPanel from "./optionsPanel";
import PlaceholderPanel from "./placeholderPanel";
import AdvancedMineralOutput from "./advancedMineralOutput";
import useReprocessingReducer from "./Hooks/useReprocessingReducer";
import useAutoRecalculation from "./Hooks/useAutoRecalculation";
import AssetsDialogue from "../Dialogues/Assets/dialogueFrame";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";

function ReprocessingPage() {
  const { state: pageState, actions: pageActions } = useReprocessingReducer();

  useAutoRecalculation(pageState, pageActions);

  return (
    <DefaultPageLayout>
      <ContentPanel
        componentName="Reprocessing Page"
        paperSx={{
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            flexGrow: 1,
            gap: 2,
            width: "100%",
          }}
        >
          {/* Left Column - Options Panel and Main Content */}
          <Box
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              gap: { xs: 0.5, md: 2 },
              order: { xs: 1, md: 1 },
            }}
          >
            {/* Options Panel */}
            <Box
              sx={{
                height: { xs: "auto", sm: "100px" },
                display: "flex",
                flexShrink: 0,
              }}
            >
              <OptionsPanel pageState={pageState} pageActions={pageActions} />
            </Box>

            {/* Main Content Area */}
            <Box
              sx={{
                flexGrow: 1,
                position: "relative",
                minHeight: { xs: "300px", md: "auto" },
              }}
            >
              <Fade in={pageState.isPageLoading} timeout={500} unmountOnExit>
                <Box
                  sx={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <DisplayLoadingPanel />
                </Box>
              </Fade>

              <Fade in={!pageState.isPageLoading} timeout={500} unmountOnExit>
                <Box sx={{ width: "100%", height: "100%" }}>
                  {pageState.reprocessingObjects.length === 0 &&
                  pageState.processedInput.length === 0 ? (
                    <PlaceholderPanel />
                  ) : (
                    <>
                      <Fade
                        in={
                          !pageState.displayAdvancedView && pageState.toMinerals
                        }
                        timeout={500}
                        unmountOnExit
                      >
                        <Box>
                          <BasicMineralOutput
                            pageState={pageState}
                            pageActions={pageActions}
                          />
                        </Box>
                      </Fade>

                      <Fade
                        in={
                          pageState.displayAdvancedView || !pageState.toMinerals
                        }
                        timeout={500}
                        unmountOnExit
                      >
                        <Box>
                          <AdvancedMineralOutput
                            pageState={pageState}
                            pageActions={pageActions}
                          />
                        </Box>
                      </Fade>
                    </>
                  )}
                </Box>
              </Fade>
            </Box>
          </Box>

          {/* Right Column - Input Controls */}
          <Box
            sx={{
              width: { xs: "100%", md: "30%" },
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              gap: 2,
              order: { xs: 2, md: 2 },
            }}
          >
            <TextInputFrame pageState={pageState} pageActions={pageActions} />

            <ReprocessingStructurePanel
              pageState={pageState}
              pageActions={pageActions}
            />
          </Box>
        </Box>
      </ContentPanel>
      <PriceHistoryDialogue />
      <MarketDataDialogue />
      <AssetsDialogue />
    </DefaultPageLayout>
  );
}

export default ReprocessingPage;
