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
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ErrorIcon from "@mui/icons-material/Error";
import { LOGIN_STEPS } from "../../../Events/loginEvents";
import { useLoginState } from "../Hooks/useLoginState";
import { LARGE_TEXT_FORMAT } from "../../../Context/defaultValues";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import DefaultPageLayout from "../../../Styled Components/defaultPageLayout";

export function UserLogInUI() {
  const { error, isStepComplete, userData } = useLoginState();

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

  const LoadingStep = ({ title, step, error }) => (
    <Grid
      container
      size={{
        xs: 6,
        sm: 3,
      }}
    >
      <Grid size={12}>
        <Tooltip title={error ? "Click to retry" : ""}>
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
        {isStepComplete(step) ? (
          <Zoom in={true}>
            <Icon sx={{ color: "success.main" }}>
              <CheckIcon />
            </Icon>
          </Zoom>
        ) : error ? (
          <Zoom in={true}>
            <Icon sx={{ color: "error.main" }}>
              <ErrorIcon />
            </Icon>
          </Zoom>
        ) : (
          <CircularProgress color="primary" />
        )}
      </Grid>
    </Grid>
  );

  return (
    <DefaultPageLayout>
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
            height: "100%"
          }}>
          {userData.userArray.length > 0 && (
            <Grid container spacing={2} size={12} sx={{
              justifyContent: "center"
            }}>
              {userData.userArray.slice(0, 5).map((user, index) => (
                <Zoom key={`login-avatar-${user.CharacterID}-${index}`} in={true}>
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
              paddingTop: { xs: "2vh", sm: "5vh" }
            }}>
            <LoadingStep
              title="Retrieving Character Data"
              step={LOGIN_STEPS.CHARACTER_DATA}
              error={error?.step === LOGIN_STEPS.CHARACTER_DATA}
            />
            <LoadingStep
              title="Building Job Planner"
              step={LOGIN_STEPS.JOB_PLANNER}
              error={error?.step === LOGIN_STEPS.JOB_PLANNER}
            />
            <LoadingStep
              title="Building Group Data"
              step={LOGIN_STEPS.GROUP_DATA}
              error={error?.step === LOGIN_STEPS.GROUP_DATA}
            />
            <LoadingStep
              title="Building Watchlist Data"
              step={LOGIN_STEPS.WATCHLIST_DATA}
              error={error?.step === LOGIN_STEPS.WATCHLIST_DATA}
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
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </Alert>
            </Grid>
          )}
        </Grid>
      </ContentPanel>
    </DefaultPageLayout>
  );
}
