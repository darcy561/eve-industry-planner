/**
 * Theme Context for EVE Industry Planner.
 *
 * Provides theme management functionality including dark/light mode switching,
 * system preference detection, and persistent theme storage. Uses Material-UI
 * theming with custom EVE Online industry-specific color schemes.
 *
 * @fileoverview Theme management context and provider for EVE Industry Planner
 * @author EVE Industry Planner Team
 */

import { createContext, use, useEffect, useMemo, useState } from "react";
import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
  responsiveFontSizes,
} from "@mui/material/styles";
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
import GLOBAL_CONFIG from "../global-config-app";
import { CssBaseline } from "@mui/material";

const { PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;

/**
 * Theme context for managing application theme state.
 *
 * Provides theme mode and toggle functionality to child components.
 *
 * @type {React.Context<Object>}
 * @property {string} mode - Current theme mode ('dark' or 'light')
 * @property {Function} toggleColorMode - Function to toggle between themes
 */
const ThemeContext = createContext();

/** Safe localStorage access when storage is null or blocked (e.g. Firefox privacy). */
export const themeStorage = {
  getItem(key) {
    try {
      return localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage?.setItem(key, value);
    } catch {
      // Storage unavailable; theme still works for this session.
    }
  },
};

/** Cookie name read by Otter Wiki `custom.js`. */
export const WIKI_THEME_COOKIE = "eip-theme";

/**
 * Cookie Domain so Otter on wiki.{host} can read the SPA theme.
 * localhost / 127.0.0.1 stay host-only (not shared with wiki.localhost).
 */
export function wikiThemeCookieDomain(hostname) {
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return hostname;
  }
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    return `.${parts.slice(-2).join(".")}`;
  }
  return hostname;
}

export function persistWikiThemeCookie(
  themeValue,
  hostname = window.location.hostname
) {
  try {
    const domain = wikiThemeCookieDomain(hostname);
    const expires = new Date();
    expires.setTime(expires.getTime() + 365 * 24 * 60 * 60 * 1000);
    const domainAttr = domain ? `;domain=${domain}` : "";
    document.cookie = `${WIKI_THEME_COOKIE}=${themeValue};expires=${expires.toUTCString()};path=/${domainAttr}`;
  } catch {
    // Cookie unavailable; wiki theme sync is best-effort.
  }
}

/**
 * Resolve the initial theme mode from storage and system preference.
 * @param {string|null} storedTheme
 * @param {boolean} systemPrefersDark
 * @param {boolean} [hasWindow=true]
 * @returns {string}
 */
export function resolveInitialThemeMode(
  storedTheme,
  systemPrefersDark,
  hasWindow = true
) {
  if (!hasWindow) {
    return PRIMARY_THEME;
  }
  return storedTheme || (systemPrefersDark ? PRIMARY_THEME : SECONDARY_THEME);
}

/**
 * Theme Provider component for EVE Industry Planner.
 *
 * Manages theme state, system preference detection, and provides theme context
 * to child components. Automatically detects system theme preferences and
 * persists user theme choices in localStorage.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to wrap with theme context
 * @returns {JSX.Element} Theme provider with Material-UI theme
 *
 * @example
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 */
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const hasWindow = typeof window !== "undefined";
    const systemPrefersDark = hasWindow
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
    return resolveInitialThemeMode(
      themeStorage.getItem("theme"),
      systemPrefersDark,
      hasWindow
    );
  });

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      if (!themeStorage.getItem("theme")) {
        setMode(e.matches ? PRIMARY_THEME : SECONDARY_THEME);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Persist theme preference
  useEffect(() => {
    themeStorage.setItem("theme", mode);
    persistWikiThemeCookie(mode);
  }, [mode]);

  const theme = useMemo(() => {
    const isDarkMode = mode === PRIMARY_THEME;

    const designTokens = {
      palette: {
        ...(mode !== SECONDARY_THEME
          ? {
              mode: PRIMARY_THEME,
              primary: { main: blue[800] },
              secondary: {
                main: grey[200],
                dark: grey[900],
                highlight: grey[800],
              },
              manufacturing: { main: green[600] },
              reaction: { main: purple[600] },
              pi: { main: red[300] },
              baseMat: { main: blueGrey[600] },
              groupJob: { main: yellow[600] },
              blueprintOriginal: { main: blue[700] },
              blueprintCopy: { main: blue[300] },
            }
          : {
              mode: SECONDARY_THEME,
              primary: { main: blue[600] },
              secondary: {
                light: grey[300],
                main: grey[600],
                highlight: grey[200],
              },
              manufacturing: { main: lightGreen[200] },
              reaction: { main: deepPurple[100] },
              pi: { main: red[200] },
              baseMat: { main: blueGrey[100] },
              groupJob: { main: yellow[600] },
              blueprintOriginal: { main: blue[700] },
              blueprintCopy: { main: blue[300] },
            }),
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            "*": {
              "&::-webkit-scrollbar": {
                width: "8px",
                height: "8px",
              },
              "&::-webkit-scrollbar-track": {
                backgroundColor: isDarkMode
                  ? "rgba(255, 255, 255, 0.05)"
                  : "rgba(0, 0, 0, 0.05)",
                borderRadius: "4px",
              },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: isDarkMode
                  ? "rgba(255, 255, 255, 0.2)"
                  : "rgba(0, 0, 0, 0.2)",
                borderRadius: "4px",
                "&:hover": {
                  backgroundColor: isDarkMode
                    ? "rgba(255, 255, 255, 0.3)"
                    : "rgba(0, 0, 0, 0.3)",
                },
              },
            },
          },
        },
      },
    };

    try {
      return responsiveFontSizes(createTheme(designTokens));
    } catch (error) {
      console.error("Error creating theme:", error);
      // Return a basic theme if creation fails
      return createTheme({ palette: { mode: isDarkMode ? "dark" : "light" } });
    }
  }, [mode]);

  const value = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((prevMode) =>
          prevMode === SECONDARY_THEME ? PRIMARY_THEME : SECONDARY_THEME
        );
      },
    }),
    [mode]
  );

  return (
    <ThemeContext value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext>
  );
}

/**
 * Custom hook to access theme context.
 *
 * Provides access to the current theme mode and toggle function.
 * Must be used within a ThemeProvider component.
 *
 * @returns {Object} Theme context value
 * @returns {string} returns.mode - Current theme mode ('dark' or 'light')
 * @returns {Function} returns.toggleColorMode - Function to toggle between themes
 *
 * @throws {Error} Throws error if used outside of ThemeProvider
 *
 * @example
 * function MyComponent() {
 *   const { mode, toggleColorMode } = useThemeContext();
 *
 *   return (
 *     <button onClick={toggleColorMode}>
 *       Current theme: {mode}
 *     </button>
 *   );
 * }
 */
export function useThemeContext() {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}
