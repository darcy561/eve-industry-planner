import { useEffect, useMemo, useState } from "react";
import {
  ThemeProvider,
  createTheme,
  responsiveFontSizes,
} from "@mui/material/styles";
import { SnackBarNotification } from "./Components/snackbar";
import { DialogBox } from "./Components/dialog";
import {
  blue,
  blueGrey,
  deepPurple,
  green,
  grey,
  lightGreen,
  purple,
  red,
  yellow,
} from "@mui/material/colors";
import CssBaseline from "@mui/material/CssBaseline";
import { NavRoutes } from "./Routes";
import { FeedbackIcon } from "./Components/Feedback/feedback";
import GLOBAL_CONFIG from "./global-config-app";
import { Box } from "@mui/material";
import { getBoolean } from "firebase/remote-config";
import { remoteConfig } from "./firebase";
import MaintenanceMode from "./MaintenanceMode";
import activateServiceWorker from "./Service Workers/activateServiceWorker";
import useServiceWorker from "./Hooks/useServiceWorker";

const { ENABLE_FEEDBACK_ICON, PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;

function getDesignTokens(mode) {
  return {
    palette: {
      ...(mode !== SECONDARY_THEME
        ? {
            mode: PRIMARY_THEME,
            primary: {
              main: blue[800],
            },
            secondary: {
              main: grey[200],
              dark: grey[900],
              highlight: grey[800],
            },
            manufacturing: {
              main: green[600],
            },
            reaction: {
              main: purple[600],
            },
            pi: {
              main: red[300],
            },
            baseMat: {
              main: blueGrey[600],
            },
            groupJob: {
              main: yellow[600],
            },
            blueprintOriginal: {
              main: blue[700],
            },
            blueprintCopy: {
              main: blue[300],
            },
          }
        : {
            mode: SECONDARY_THEME,
            primary: {
              main: blue[600],
            },
            secondary: {
              light: grey[300],
              main: grey[600],
              highlight: grey[200],
            },
            manufacturing: {
              main: lightGreen[200],
            },
            reaction: {
              main: deepPurple[100],
            },
            pi: {
              main: red[200],
            },
            baseMat: {
              main: blueGrey[100],
            },
            groupJob: {
              main: yellow[600],
            },
            blueprintOriginal: {
              main: blue[700],
            },
            blueprintCopy: {
              main: blue[300],
            },
          }),
    },
  };
}

export default function App() {
  const [mode, setMode] = useState(
    localStorage.getItem("theme") || PRIMARY_THEME
  );
  activateServiceWorker();
  useServiceWorker();

  useEffect(() => {
    localStorage.setItem("theme", mode);
  }, [mode]);

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) =>
          prevMode === SECONDARY_THEME ? PRIMARY_THEME : SECONDARY_THEME
        );
      },
    }),
    []
  );

  const theme = useMemo(
    () => responsiveFontSizes(createTheme(getDesignTokens(mode))),
    [mode]
  );

  const isMaintenanceMode = getBoolean(remoteConfig, "maintenance_mode");

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: "flex", width: "100%", height: "100%" }}>
        <CssBaseline />
        <SnackBarNotification />
        <DialogBox />
        {isMaintenanceMode ? (
          <MaintenanceMode />
        ) : (
          <NavRoutes colorMode={colorMode} />
        )}
        {ENABLE_FEEDBACK_ICON && !isMaintenanceMode && <FeedbackIcon />}
      </Box>
    </ThemeProvider>
  );
}
