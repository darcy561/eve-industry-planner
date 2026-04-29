import {
  Box,
  Button,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import { CSSTransition, SwitchTransition } from "react-transition-group";
import { useNavigate } from "@tanstack/react-router";
import useUsersStore from "../../../Zustand/usersStore";
import DefaultPageLayout from "../../../Styled Components/defaultPageLayout";
import {
  flushPendingUserDocumentSaves,
} from "../../../Functions/Debounce/userDocumentsPersistSchedule";
import { saveUserAccountDocument } from "../../../Functions/Endpoints/Pirivate/userDocument";
import { LoadingBrandBackdrop } from "../../loadingBrand";
import { FIRST_LOGIN_STEPS } from "./firstLoginConstants";
import { FirstLoginWelcomeBanner } from "../welcome/FirstLoginWelcomeBanner";
import { FirstLoginPlannerSetupStep } from "../planner-setup/FirstLoginPlannerSetupStep";
import { FirstLoginAccountsStep } from "../accounts/FirstLoginAccountsStep";
import { FirstLoginSupportStep } from "../support/FirstLoginSupportStep";

/** Durations must match `CSSTransition` `timeout` (used for transition end). */
const STEP_ENTER_MS = 520;
const STEP_EXIT_MS = 440;
const STEP_ENTER_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const STEP_EXIT_EASE = "cubic-bezier(0.4, 0, 1, 1)";
/** Height easing spans full out-in so the shell shrinks/grows with the slide. */
const STEP_VIEWPORT_HEIGHT_MS = STEP_ENTER_MS + STEP_EXIT_MS;

export default function FirstLoginPage() {
  const navigate = useNavigate({ from: "/_protected/first-login" });
  const [activeStep, setActiveStep] = useState(0);
  /**
   * Continue: current panel exits to the right, next enters from the left.
   * Back: current exits left, next enters from the right.
   * (MUI `Slide` ties enter/exit to one axis, so we use `CSSTransition` + transform instead.)
   */
  const [stepNav, setStepNav] = useState("forward");
  const [isFinishing, setIsFinishing] = useState(false);
  const stepPanelRef = useRef(null);
  const [viewportHeightPx, setViewportHeightPx] = useState(null);
  const [canAnimateViewportHeight, setCanAnimateViewportHeight] =
    useState(false);

  useEffect(() => {
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setCanAnimateViewportHeight(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
    };
  }, []);

  useEffect(() => {
    const roRef = { current: null };

    const attach = () => {
      roRef.current?.disconnect();
      roRef.current = null;
      const el = stepPanelRef.current;
      if (!el) {
        return;
      }
      const ro = new ResizeObserver(() => {
        const node = stepPanelRef.current;
        if (!node) {
          return;
        }
        setViewportHeightPx(Math.ceil(node.getBoundingClientRect().height));
      });
      roRef.current = ro;
      ro.observe(el);
      setViewportHeightPx(Math.ceil(el.getBoundingClientRect().height));
    };

    attach();
    const retryId = window.setTimeout(
      attach,
      STEP_ENTER_MS + STEP_EXIT_MS + 32,
    );

    return () => {
      window.clearTimeout(retryId);
      roRef.current?.disconnect();
    };
  }, [activeStep]);

  const isLastStep = useMemo(
    () => activeStep === FIRST_LOGIN_STEPS.length - 1,
    [activeStep],
  );

  const completeFlow = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    const state = useUsersStore.getState();
    state.account.actions.setHasCompletedFirstLoginFlow(true);
    state.account.actions.setIsFirstTimeLogin(false);
    await flushPendingUserDocumentSaves();
    const saved = await saveUserAccountDocument();
    if (!saved) {
      setIsFinishing(false);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const goNext = () => {
    setStepNav("forward");
    setActiveStep((prev) => Math.min(prev + 1, FIRST_LOGIN_STEPS.length - 1));
  };

  const goBack = () => {
    setStepNav("backward");
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const stepTransitionSx = useMemo(() => {
    const trEnter = `transform ${STEP_ENTER_MS}ms ${STEP_ENTER_EASE}`;
    const trExit = `transform ${STEP_EXIT_MS}ms ${STEP_EXIT_EASE}`;
    if (stepNav === "forward") {
      return {
        width: "100%",
        "&.fl-step-enter": { transform: "translateX(-100%)", transition: "none" },
        "&.fl-step-enter-active": {
          transform: "translateX(0)",
          transition: trEnter,
        },
        "&.fl-step-exit": { transform: "translateX(0)", transition: "none" },
        "&.fl-step-exit-active": {
          transform: "translateX(100%)",
          transition: trExit,
        },
      };
    }
    return {
      width: "100%",
      "&.fl-step-enter": { transform: "translateX(100%)", transition: "none" },
      "&.fl-step-enter-active": {
        transform: "translateX(0)",
        transition: trEnter,
      },
      "&.fl-step-exit": { transform: "translateX(0)", transition: "none" },
      "&.fl-step-exit-active": {
        transform: "translateX(-100%)",
        transition: trExit,
      },
    };
  }, [stepNav]);

  const stepPanel =
    activeStep === 0 ? (
      <FirstLoginPlannerSetupStep />
    ) : activeStep === 1 ? (
      <FirstLoginAccountsStep />
    ) : (
      <FirstLoginSupportStep />
    );

  return (
    <DefaultPageLayout>
      <LoadingBrandBackdrop
        sx={{
          width: "100%",
          borderRadius: 3,
          alignItems: "stretch",
          justifyContent: "flex-start",
          py: { xs: 2, md: 3 },
          px: { xs: 1, md: 2 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 1320,
            mx: "auto",
            p: { xs: 2, md: 3 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: (theme) => alpha(theme.palette.primary.main, 0.22),
            bgcolor: (theme) =>
              alpha(
                theme.palette.background.paper,
                theme.palette.mode === "dark" ? 0.84 : 0.94,
              ),
            backdropFilter: "blur(4px)",
            overflow: "auto",
          }}
        >
          <Stack spacing={3}>
            <FirstLoginWelcomeBanner />

            <Stepper activeStep={activeStep}>
              {FIRST_LOGIN_STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <Box
              sx={{
                overflow: "hidden",
                width: "100%",
                height:
                  viewportHeightPx == null ? "auto" : `${viewportHeightPx}px`,
                transition: canAnimateViewportHeight
                  ? `height ${STEP_VIEWPORT_HEIGHT_MS}ms ${STEP_ENTER_EASE}`
                  : "none",
              }}
            >
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  overflow: "hidden",
                }}
              >
                <SwitchTransition mode="out-in">
                  <CSSTransition
                    key={activeStep}
                    nodeRef={stepPanelRef}
                    timeout={{ enter: STEP_ENTER_MS, exit: STEP_EXIT_MS }}
                    classNames="fl-step"
                    appear={false}
                    unmountOnExit
                  >
                    <Box ref={stepPanelRef} sx={stepTransitionSx}>
                      {stepPanel}
                    </Box>
                  </CSSTransition>
                </SwitchTransition>
              </Box>
            </Box>

            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Button
                variant="text"
                disabled={activeStep === 0}
                onClick={goBack}
              >
                Back
              </Button>
              {isLastStep ? (
                <Button
                  variant="contained"
                  onClick={() => void completeFlow()}
                  disabled={isFinishing}
                >
                  Finish Setup
                </Button>
              ) : (
                <Button variant="contained" onClick={goNext}>
                  Continue
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>
      </LoadingBrandBackdrop>
    </DefaultPageLayout>
  );
}
