import { Box, Divider, Drawer, Toolbar, useMediaQuery } from "@mui/material";

function CollapseableContentDrawer_Right({ state, actions, DrawerContent }) {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const drawerWidth = state.expandRightDrawer
    ? deviceNotMobile
      ? "25%"
      : "90%"
    : 0;
  return (
    <Drawer
      variant="permanent"
      anchor="right"
      open={state.expandRightDrawer}
      sx={{
        display: "flex",
        width: drawerWidth,
        flexShrink: 0,
        transition: "width 0.3s ease-in-out",
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: "border-box",
          transition: "width 0.3s ease-in-out",
          marginTop: "64px",
          height: { xs: "calc(100vh - 64px)", sm: "calc(100% - 64px)" },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
        }}
      >
        <Box
          sx={{
            width: "100%",
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
          }}
        >
          {DrawerContent}
        </Box>
        <Divider />
      </Box>
    </Drawer>
  );
}

export default CollapseableContentDrawer_Right;
