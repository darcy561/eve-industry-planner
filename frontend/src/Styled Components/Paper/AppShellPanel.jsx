import { Box, Paper, Typography } from "@mui/material";

import ActionMenu from "../Menu/ActionMenu";
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
 * @param {Array<{label: string, onClick?: Function, disabled?: boolean, disabledReason?: string}>} [props.menuItems]
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
      {/* The breakpoints are the twelve-column header's, in flex: a control takes its own line on
          a phone and shares the title's line from `sm` up. Eighteen panels draw this header, so
          the conversion off `Grid` had to leave every one of them where it was. */}
      {hasHeader && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5,
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1.5,
          }}
        >
          {title && (
            <Typography
              color="text.secondary"
              sx={{
                typography: { xs: "caption", md: "body2" },
                flexGrow: 1,
                flexBasis: { xs: "100%", sm: 0 },
                minWidth: 0,
              }}
            >
              {title}
            </Typography>
          )}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              justifyContent: "flex-end",
              flexShrink: 0,
              flexBasis: { xs: "100%", sm: "auto" },
            }}
          >
            {action}
            {hasMenu && (
              <ActionMenu
                items={menuItems}
                label={title ? `${title} actions` : "Panel actions"}
              />
            )}
          </Box>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          width: "100%",
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
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
