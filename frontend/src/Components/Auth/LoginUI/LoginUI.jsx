import {
  Avatar,
  CircularProgress,
  Grid,
  Icon,
  Typography,
  Zoom,
  Tooltip,
  Alert,
  Button,
  IconButton,
} from "@mui/material";
import { useTransition } from "react";
import CheckIcon from "@mui/icons-material/Check";
import ErrorIcon from "@mui/icons-material/Error";
import { LOGIN_STEPS } from "../../../Events/loginEvents";
import {
  canRetryLoginStep,
  retryLoginStep,
} from "../../../Functions/Auth/retryLoginStep.js";
import { useLoginState } from "../Hooks/useLoginState";
import { LARGE_TEXT_FORMAT } from "../../../Context/defaultValues";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";

/**
 * One step of the login progress row.
 *
 * A failed step that can be re-run is a button, so the reader recovers the login
 * rather than reloading the page and losing what the other steps already fetched.
 */
function LoadingStep({ title, complete, error, onRetry, retrying }) {
  const retryable = error && typeof onRetry === "function";
  return (
    <Grid
      container
      size={{
        xs: 6,
        sm: 3,
      }}
    >
      <Grid size={12}>
        <Tooltip title={retryable ? "Click to retry" : ""}>
          <Typography
            align="center"
            sx={{
              typography: LARGE_TEXT_FORMAT,
              color: error ? "error.main" : "text.primary",
            }}
          >
            {title}
          </Typography>
        </Tooltip>
      </Grid>
      <Grid align="center" size={12}>
        {complete ? (
          <Zoom in={true}>
            <Icon sx={{ color: "success.main" }}>
              <CheckIcon />
            </Icon>
          </Zoom>
        ) : retrying ? (
          <CircularProgress color="primary" />
        ) : error ? (
          <Zoom in={true}>
            {retryable ? (
              <IconButton
                aria-label={`Retry ${title}`}
                onClick={onRetry}
                sx={{ color: "error.main" }}
              >
                <ErrorIcon />
              </IconButton>
            ) : (
              <Icon sx={{ color: "error.main" }}>
                <ErrorIcon />
              </Icon>
            )}
          </Zoom>
        ) : (
          <CircularProgress color="primary" />
        )}
      </Grid>
    </Grid>
  );
}

export function UserLogInUI() {
  const { error, isStepComplete, userData } = useLoginState();
  const [retrying, startRetry] = useTransition();

  // The failed step, when re-running it is an option. Anything else keeps the
  // reload below, which is the only way back from a step this cannot re-run.
  // Only one step can be in error at a time, so one flag covers the retry.
  const retryableStep = canRetryLoginStep(error?.step) ? error.step : null;

  const retryStep = (step) => startRetry(() => retryLoginStep(step));

  /** The props that make a failed step clickable, for the step that failed. */
  const retryProps = (step) =>
    retryableStep === step ? { onRetry: () => retryStep(step), retrying } : {};

  const getStepName = (step) => {
    switch (step) {
      case LOGIN_STEPS.CHARACTER_DATA:
        return "Character Data";
      case LOGIN_STEPS.JOB_PLANNER:
        return "Job Planner";
      case LOGIN_STEPS.GROUP_DATA:
        return "Group Data";
      case LOGIN_STEPS.WATCHLIST_DATA:
        return "Watchlist";
      default:
        return "Unknown Step";
    }
  };

  return (
    <>
      <ContentPanel
        componentName="Login UI"
        paperSx={{ overflow: "hidden" }}
        title="Welcome to Eve Industry Planner"
        titleTypography={{ xs: "h5", sm: "h4" }}
        titleColor="primary"
        titleAlign="center"
        titleMarginBottom={{ xs: 2, sm: 5 }}
      >
        <Grid
          container
          spacing={2}
          sx={{
            justifyContent: "center",
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
          }}
        >
          {userData.userArray.length > 0 && (
            <Grid
              container
              spacing={2}
              size={12}
              sx={{
                justifyContent: "center",
              }}
            >
              {userData.userArray.slice(0, 5).map((user, index) => (
                <Zoom
                  key={`login-avatar-${user.CharacterID}-${index}`}
                  in={true}
                >
                  <Grid
                    container
                    sx={{ marginBottom: "10px" }}
                    size={{
                      xs: 6,
                      sm: 4,
                      md: 2.4,
                    }}
                  >
                    <Grid align="center" size={12}>
                      <Avatar
                        src={`https://images.evetech.net/characters/${user.CharacterID}/portrait`}
                        variant="circular"
                        sx={{
                          height: { xs: "48px", sm: "64px", lg: "128px" },
                          width: { xs: "48px", sm: "64px", lg: "128px" },
                          border: "2px solid",
                          borderColor: "primary.main",
                        }}
                      />
                    </Grid>
                    <Grid sx={{ marginTop: "5px" }} size={12}>
                      <Typography
                        align="center"
                        sx={{ typography: LARGE_TEXT_FORMAT }}
                      >
                        {user.CharacterName}
                      </Typography>
                    </Grid>
                  </Grid>
                </Zoom>
              ))}
              {userData.userArray.length > 5 && (
                <Zoom in={true}>
                  <Grid
                    container
                    sx={{ marginBottom: "10px" }}
                    size={{
                      xs: 6,
                      sm: 4,
                      md: 2.4,
                    }}
                  >
                    <Grid align="center" size={12}>
                      <Avatar
                        variant="circular"
                        sx={{
                          color: "white",
                          bgcolor: "primary.main",
                          height: { xs: "48px", sm: "64px", lg: "128px" },
                          width: { xs: "48px", sm: "64px", lg: "128px" },
                        }}
                      >
                        +{userData.userArray.length - 5}
                      </Avatar>
                    </Grid>
                  </Grid>
                </Zoom>
              )}
            </Grid>
          )}

          <Grid
            container
            spacing={2}
            size={12}
            sx={{
              justifyContent: "center",
              paddingTop: { xs: "2vh", sm: "5vh" },
            }}
          >
            <LoadingStep
              title="Retrieving Character Data"
              complete={isStepComplete(LOGIN_STEPS.CHARACTER_DATA)}
              error={error?.step === LOGIN_STEPS.CHARACTER_DATA}
            />
            <LoadingStep
              title="Building Job Planner"
              complete={isStepComplete(LOGIN_STEPS.JOB_PLANNER)}
              error={error?.step === LOGIN_STEPS.JOB_PLANNER}
              {...retryProps(LOGIN_STEPS.JOB_PLANNER)}
            />
            <LoadingStep
              title="Building Group Data"
              complete={isStepComplete(LOGIN_STEPS.GROUP_DATA)}
              error={error?.step === LOGIN_STEPS.GROUP_DATA}
              {...retryProps(LOGIN_STEPS.GROUP_DATA)}
            />
            <LoadingStep
              title="Building Watchlist Data"
              complete={isStepComplete(LOGIN_STEPS.WATCHLIST_DATA)}
              error={error?.step === LOGIN_STEPS.WATCHLIST_DATA}
              {...retryProps(LOGIN_STEPS.WATCHLIST_DATA)}
            />
          </Grid>
          {error && (
            <Grid
              align="center"
              size={12}
              sx={{ marginTop: { xs: 2, sm: 10 } }}
            >
              <Alert severity="error" sx={{ mb: 2 }}>
                Error in {getStepName(error?.step)}: {error?.message}
                <Button
                  color="inherit"
                  size="small"
                  disabled={retrying}
                  onClick={
                    retryableStep
                      ? () => retryStep(retryableStep)
                      : () => window.location.reload()
                  }
                >
                  Retry
                </Button>
              </Alert>
            </Grid>
          )}
        </Grid>
      </ContentPanel>
    </>
  );
}
