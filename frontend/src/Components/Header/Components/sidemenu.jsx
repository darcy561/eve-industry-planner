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
import useUsersStore from "../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import useAppConfig from "../../../Hooks/App/useAppConfig";

export function SideMenu({ open, setOpen }) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const { eveServerStatus, evePlayerCount } = useUsersStore(
    (state) => state.worldData
  );
  const navigate = useNavigate();

  const { enable_upcoming_changes_page: enableUpcomingChanges = false } =
    useAppConfig();

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
              Player Count:{" "}
              {formatNumberForLocale(evePlayerCount, { max: 0 })}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ width: "250px" }}>
          <List>
            <Divider />
            <ListItemButton
              onClick={() => {
                navigate({ to: isLoggedIn ? "/dashboard" : "/" });
                setOpen(false);
              }}
            >
              {isLoggedIn ? (
                <ListItemText primary={"Dashboard"} />
              ) : (
                <ListItemText primary={"Home"} />
              )}
            </ListItemButton>

            <Divider />
            {isLoggedIn && (
              <>
                <Divider />
                <ListItemButton
                  onClick={() => {
                    navigate({ to: "/asset-library" });
                    setOpen(false);
                  }}
                >
                  <ListItemText primary={"Asset Library"} />
                </ListItemButton>
              </>
            )}
            <Divider />
            {isLoggedIn && (
              <>
                <ListItemButton
                  onClick={() => {
                    navigate({ to: "/blueprint-library" });
                    setOpen(false);
                  }}
                >
                  <ListItemText primary={"Blueprint Library"} />
                </ListItemButton>
                <Divider />
              </>
            )}

            <ListItemButton
              onClick={() => {
                navigate({ to: "/jobplanner" });
                setOpen(false);
              }}
            >
              <ListItemText primary={"Job Planner"} />
            </ListItemButton>
            <Divider />
            <ListItemButton
              onClick={() => {
                navigate({ to: "/reprocessing" });
                setOpen(false);
              }}
            >
              <ListItemText primary={"Reprocessing Calculator"} />
            </ListItemButton>
            <Divider />
            <ListItemButton
              onClick={() => {
                navigate({ to: "/itemtrees" });
                setOpen(false);
              }}
            >
              <ListItemText primary={"Item Tree"} />
            </ListItemButton>
            <Divider />
            {enableUpcomingChanges && (
              <>
                <ListItemButton
                  onClick={() => {
                    navigate({ to: "/upcoming-changes" });
                    setOpen(false);
                  }}
                >
                  <ListItemText primary={"Upcoming Changes"} />
                </ListItemButton>
                <Divider />
              </>
            )}
            <Divider />
          </List>
        </Box>
      </Box>

      {/* Bottom Section*/}
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
            <ListItemButton
              onClick={() => {
                navigate({ to: "/accounts" });
                setOpen(false);
              }}
            >
              <ListItemText primary={"Accounts"} />
            </ListItemButton>
            <Divider />
            <ListItemButton
              onClick={() => {
                navigate({ to: "/settings" });
                setOpen(false);
              }}
            >
              <ListItemText primary={"Settings"} />
            </ListItemButton>
            <Divider />
            <ListItemButton
              onClick={() => {
                navigate({ to: "/signout" });
                setOpen(false);
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
