import { useState } from "react";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import ContentErrorBoundary from "./ContentErrorBoundary";
import PanelFallBack from "./panelStates";
import { LoadingPage } from "../../Components/loadingPage";
import { appShellSetupSectionPaperSx } from "../../Context/appShell";

/**
 * A content panel in the app-shell design.
 *
 * Carries what ContentPanel provides — an error boundary, loading and error
 * states, an optional overflow menu — on the outlined app-shell surface rather
 * than the elevated square Paper. Panels that have already moved to the new
 * design use this so a page does not mix the two.
 *
 * The title sits left in the secondary colour, matching the surrounding
 * app-shell panels rather than the centred primary heading of the older shell.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.title]
 * @param {React.ReactNode} [props.action] - control shown opposite the title
 * @param {string} [props.componentName] - error boundary label
 * @param {boolean} [props.isLoading]
 * @param {boolean} [props.isError]
 * @param {Error} [props.error]
 * @param {string} [props.loadingMessage]
 * @param {'minimal'|'simple'} [props.loadingVariant]
 * @param {Object} [props.paperSx]
 * @param {Object} [props.contentSx]
 * @param {boolean} [props.visible]
 * @param {boolean} [props.enableMenu]
 * @param {Array<{label: string, onClick?: Function, disabled?: boolean}>} [props.menuItems]
 */
export default function AppShellPanel({
  children,
  title,
  action,
  componentName,
  isLoading = false,
  isError = false,
  error = null,
  loadingMessage,
  loadingVariant = "minimal",
  paperSx,
  contentSx,
  visible = true,
  enableMenu = false,
  menuItems = [],
  ...otherProps
}) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  if (!visible) return null;

  const hasMenu = enableMenu && menuItems.length > 0;
  const hasHeader = Boolean(title || action || hasMenu);

  return (
    <Paper
      variant="outlined"
      sx={{
        ...appShellSetupSectionPaperSx,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...paperSx,
      }}
      {...otherProps}
    >
      {hasHeader && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1.5, minHeight: 32 }}
        >
          {title && (
            <Typography
              color="text.secondary"
              sx={{ typography: { xs: "caption", md: "body2" } }}
            >
              {title}
            </Typography>
          )}
          <Stack direction="row" spacing={1} alignItems="center">
            {action}
            {hasMenu && (
              <>
                <IconButton
                  id="appShellPanel_menu_button"
                  size="small"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                  aria-controls={menuAnchor ? "appShellPanel_menu" : undefined}
                  aria-haspopup="true"
                  aria-expanded={menuAnchor ? "true" : undefined}
                >
                  <MoreVertIcon fontSize="small" color="primary" />
                </IconButton>
                <Menu
                  id="appShellPanel_menu"
                  anchorEl={menuAnchor}
                  open={Boolean(menuAnchor)}
                  onClose={() => setMenuAnchor(null)}
                  slotProps={{
                    list: { "aria-labelledby": "appShellPanel_menu_button" },
                  }}
                >
                  {menuItems.map((item) => (
                    <MenuItem
                      key={item.label}
                      disabled={item.disabled || false}
                      onClick={() => {
                        item.onClick?.({
                          closeMenu: () => setMenuAnchor(null),
                          anchorEl: menuAnchor,
                        });
                        setMenuAnchor(null);
                      }}
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                </Menu>
              </>
            )}
          </Stack>
        </Stack>
      )}

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          ...contentSx,
        }}
      >
        <ContentErrorBoundary
          componentName={componentName || title || "Unknown Panel"}
        >
          {isError ? (
            <PanelFallBack isLoading={false} isError error={error} />
          ) : isLoading ? (
            loadingVariant === "simple" ? (
              <LoadingPage
                variant="simple"
                helperText={loadingMessage?.trim() || "Loading…"}
              />
            ) : (
              <PanelFallBack
                isLoading
                isError={false}
                error={error}
                loadingMessage={loadingMessage}
              />
            )
          ) : (
            children
          )}
        </ContentErrorBoundary>
      </Box>
    </Paper>
  );
}
