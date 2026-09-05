import { memo, useEffect, useState } from "react";
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Toolbar,
  useMediaQuery,
} from "@mui/material";
import KeyboardDoubleArrowRightOutlinedIcon from "@mui/icons-material/KeyboardDoubleArrowRightOutlined";
import KeyboardDoubleArrowLeftOutlinedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftOutlined";
import { SidemenuButtonTemplate_Default } from "./defaultButtonTemplate";

function LeftCollapsibleMenuDrawer({
  inputDrawerButtons,
  AlternativeButtonTemplate,
}) {
  const localStorageItemKey = "sideMenuExpanded";
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const [expandedDrawer, setExpandedDrawer] = useState(
    getInitialExpandedDrawerState(deviceNotMobile)
  );

  useEffect(() => {
    try {
      localStorage.setItem(localStorageItemKey, expandedDrawer.toString());
    } catch (error) {
      console.error("Error saving to localStorage", error);
    }
  }, [expandedDrawer]);

  function getInitialExpandedDrawerState(mobileDevice) {
    try {
      const state = localStorage.getItem(localStorageItemKey);
      if (!mobileDevice) return false;
      if (state == null) return true;
      return state === "true";
    } catch (error) {
      console.error("Error accessing localStorage", error);
      return deviceNotMobile;
    }
  }

  const drawerWidth = expandedDrawer ? 240 : 50;
  const SelectedButtonTemplate =
    AlternativeButtonTemplate || SidemenuButtonTemplate_Default;

  return (
    <Drawer
      variant="permanent"
      anchor="left"
      open={expandedDrawer}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        transition: "width 0.3s ease-in-out",
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: "border-box",
          transition: "width 0.3s ease-in-out",
          marginTop: '64px',
          height: { xs: 'calc(100vh - 64px)', sm: 'calc(100% - 64px)' },
          position: 'fixed',
          overflow: 'hidden'
        },
      }}
    >
      <Box sx={{ 
        display: "flex", 
        flexDirection: "column", 
        height: "100%",
        overflow: 'hidden'
      }}>
        <Box
          sx={{
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            pb: 8,
            '&::-webkit-scrollbar': {
              display: 'none'
            }
          }}
        >
          <List>
            {inputDrawerButtons?.map((option, index) => {
              return (
                <SelectedButtonTemplate
                  key={option.key ? option.key : `leftMenuButton-${index}`}
                  buttonContent={option}
                  expandedState={expandedDrawer}
                />
              );
            })}
          </List>
        </Box>
        <Divider />
        <Box
          sx={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <List sx={{ width: "100%" }}>
            <ListItem
              disablePadding
              onClick={() => {
                localStorage.setItem(localStorageItemKey, !expandedDrawer);
                setExpandedDrawer((prev) => !prev);
              }}
              sx={{
                display: "block",
                "&:hover": {
                  "& .MuiListItemIcon-root, & .MuiListItemText-root": {
                    color: "primary.main",
                  },
                },
              }}
            >
              <ListItemButton
                sx={{
                  minHeight: 48,
                  justifyContent: "center",
                  paddingRight: 2.5,
                  paddingLeft: 2.5,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    justifyContent: "center",
                  }}
                >
                  {expandedDrawer ? (
                    <KeyboardDoubleArrowLeftOutlinedIcon />
                  ) : (
                    <KeyboardDoubleArrowRightOutlinedIcon />
                  )}
                </ListItemIcon>
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Box>
    </Drawer>
  );
}

export default memo(LeftCollapsibleMenuDrawer);
