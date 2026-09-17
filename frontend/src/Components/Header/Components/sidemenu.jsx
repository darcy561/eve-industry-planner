import {
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import {
  RouterListItemButton,
  whenFollowed,
} from "../../../Styled Components/Navigation/routerControls.jsx";
import { canVisitRoute } from "../../../utils/routeAccess.js";
import useUsersStore from "../../../Zustand/usersStore";
import { useTranquilityServerStatusQuery } from "../../../Hooks/React Query/tranquilityServerStatus.js";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import { PlannerSwitcher } from "./plannerSwitcher.jsx";

/**
 * One destination in the menu: a real link, so it can be opened in a new tab.
 *
 * Whether it belongs in front of this reader is the route's own answer, so the menu
 * never holds a second opinion about which pages need an account.
 */
function NavItem({ to, primary, onNavigated }) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  if (!canVisitRoute(to, isLoggedIn)) return null;

  return (
    <RouterListItemButton to={to} onClick={whenFollowed(onNavigated)}>
      <ListItemText primary={primary} />
    </RouterListItemButton>
  );
}

export function SideMenu({ open, setOpen }) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { data: tranquilityStatus } = useTranquilityServerStatusQuery();
  const eveServerStatus = tranquilityStatus?.online ?? false;
  const evePlayerCount = tranquilityStatus?.playerCount ?? 0;
  const navigate = useNavigate();
  const close = () => setOpen(false);

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      sx={{
        "& .MuiDrawer-paper": {
          zIndex: (theme) => theme.zIndex.appBar + 2,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        },
      }}
    >
      {/* Top Section */}
      <Box sx={{ flexShrink: 0 }}>
        <Box sx={{ minHeight: "4rem" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: { xs: "8px 0px", sm: "10px 0px" },
            }}
          >
            <Typography variant="body1">
              Tranquility: {eveServerStatus ? "Online" : "Offline"}
            </Typography>
            <Typography variant="body1">
              Player Count: {formatNumberForLocale(evePlayerCount, { max: 0 })}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ width: "250px" }}>
          <List>
            <Divider />
            <NavItem
              to={isLoggedIn ? "/dashboard" : "/"}
              primary={isLoggedIn ? "Dashboard" : "Home"}
              onNavigated={close}
            />

            <Divider />
            {isLoggedIn && (
              <>
                {/* Exercises the planner endpoints and the websocket switch. The
                    app still works in the account's own planner; this points the
                    connection somewhere else without moving the data. */}
                <PlannerSwitcher />
                <Divider />
              </>
            )}
            <NavItem
              to="/asset-library"
              primary="Asset Library"
              onNavigated={close}
            />
            <NavItem
              to="/blueprint-library"
              primary="Blueprint Library"
              onNavigated={close}
            />
            <NavItem
              to="/archived-jobs"
              primary="Archived Jobs"
              onNavigated={close}
            />
            <Divider />
            <NavItem
              to="/jobplanner"
              primary="Job Planner"
              onNavigated={close}
            />
            <Divider />
            <NavItem
              to="/reprocessing"
              primary="Reprocessing Calculator"
              onNavigated={close}
            />
            <Divider />
            <NavItem to="/itemtrees" primary="Item Tree" onNavigated={close} />
            <Divider />
            <Divider />
          </List>
        </Box>
      </Box>

      {/* The account's own block. This gate stays where the others went: it holds
          Sign Out, which is an action rather than a page to be let into. */}
      {isLoggedIn && (
        <Box
          sx={{
            marginTop: "auto",
            flexShrink: 0,
            width: "250px",
          }}
        >
          <List sx={{ display: "flex", flexDirection: "column" }}>
            <Divider />
            <NavItem to="/accounts" primary="Accounts" onNavigated={close} />
            <Divider />
            <NavItem to="/settings" primary="Settings" onNavigated={close} />
            <Divider />
            {/* Not a link: the route tears the session down in `beforeLoad`, and the
                router preloads on intent — so hovering a link here would sign out. */}
            <ListItemButton
              onClick={() => {
                navigate({ to: "/signout" });
                close();
              }}
              sx={{
                "& .MuiListItemText-primary": {
                  color: "error.main",
                },
                "&:hover .MuiListItemText-primary": {
                  color: "text.primary",
                },
              }}
            >
              <ListItemText primary={"Sign Out"} />
            </ListItemButton>
          </List>
        </Box>
      )}
    </Drawer>
  );
}
