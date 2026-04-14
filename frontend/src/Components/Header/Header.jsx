import { useState } from "react";
import {
  Box,
  Typography,
  AppBar,
  Toolbar,
  Tooltip,
  IconButton,
  useMediaQuery,
} from "@mui/material";
import { SideMenu } from "./Components/sidemenu";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { UserIcon } from "./Components/UserIcon";
import { useTheme } from "@emotion/react";
import { useThemeContext } from "../../Context/ThemeContext";
import useUsersStore from "../../Zustand/usersStore";
import redirectToEveSSO from "../Auth/Functions/eveSSORedirect";
import OfflineNotificationIcon from "./Components/offlineNotificationIcon";

export function Header() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const [open, setOpen] = useState(false);
  const { toggleColorMode } = useThemeContext();
  const theme = useTheme();
  const currentTheme = theme.palette.mode;
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.appBar }}>
      <Toolbar
        sx={{
          paddingLeft: { xs: "8px", sm: "16px" },
          paddingRight: { xs: "4px", sm: "8px" },
        }}
      >
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          onClick={() => {
            setOpen(!open);
          }}
        >
          <MenuIcon />
        </IconButton>

        <SideMenu open={open} setOpen={setOpen} />
        <Typography
          align="center"
          sx={{
            typography: { xs: "subtitle2", sm: "h5" },
            flexGrow: "1",
            display: { xs: "flex" },
          }}
        >
          Eve Industry Planner
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "10px",
          }}
        >
          <OfflineNotificationIcon />
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "10px",
          }}
        >
          <Tooltip title="Toggle Light/Dark Theme" arrow>
            <IconButton
              color="inherit"
              onClick={() => {
                toggleColorMode();
              }}
            >
              {currentTheme === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        {isLoggedIn ? (

          <UserIcon />
        ) : (
          <Tooltip title="Login with EVE SSO" arrow>
            <Box
              onClick={() => {
                redirectToEveSSO();
              }}
              sx={{
                marginLeft: "5px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Box
                component="img"
                src={
                  isMobile
                    ? currentTheme === "dark"
                      ? "https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-small.png"
                      : "https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-white-small.png"
                    : currentTheme === "dark"
                      ? "https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-large.png"
                      : "https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-white-large.png"
                }
                alt="EVE SSO Login"
                sx={{
                  maxHeight: "100%",
                  height: "auto",
                  width: "auto",
                }}
              />
            </Box>
          </Tooltip>
        )}
      </Toolbar>
    </AppBar>
  );
}
