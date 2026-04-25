import { Paper, Typography, Grid, IconButton, Menu, MenuItem } from "@mui/material";
import { useState } from "react";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import ContentErrorBoundary from "./ContentErrorBoundary";
import PanelFallBack from "./panelStates";
import { LoadingPage } from "../../Components/loadingPage";

/**
 * A reusable content panel component with error boundary and loading states.
 * Provides consistent styling and layout for content sections throughout the application.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Content to display inside the panel
 * @param {string} [props.title] - Optional title to display at the top of the panel
 * @param {number} [props.elevation=3] - Material-UI Paper elevation level
 * @param {string} [props.padding="20px"] - Internal padding for the panel content
 * @param {Object} [props.titleTypography] - Typography variant for the title
 * @param {string} [props.titleColor="primary"] - Color theme for the title
 * @param {string} [props.titleAlign="center"] - Text alignment for the title
 * @param {string} [props.titleMarginBottom="20px"] - Bottom margin for the title
 * @param {Object} [props.marginLeft] - Left margin responsive values
 * @param {Object} [props.marginRight] - Right margin responsive values
 * @param {boolean} [props.square=true] - Whether the Paper should have square corners
 * @param {string} [props.componentName] - Name for error boundary logging
 * @param {boolean} [props.isLoading=false] - Whether to show loading state
 * @param {boolean} [props.isError=false] - Whether to show error state
 * @param {Error} [props.error] - Error object to display if isError is true
 * @param {string} [props.loadingMessage] - Optional caption for the loading fallback (default in PanelFallBack or "Loading…" for simple)
 * @param {'minimal' | 'simple'} [props.loadingVariant='minimal'] - `simple` uses shared LoadingPage (spinner + caption), e.g. Edit Job initial load after route chunk
 * @param {Object} [props.paperSx] - Additional styles for the Paper component
 * @param {Object} [props.contentGridSx] - Additional styles merged into the inner content Grid (e.g. overflow: "visible" for panels that size to content)
 * @param {boolean} [props.visible=true] - When false, the panel is not rendered
 * @param {boolean} [props.enableMenu=false] - Whether to show top-right 3-dot menu
 * @param {Array<Object>} [props.menuItems=[]] - Menu item configs
 * @param {string} props.menuItems[].label - Menu item label text
 * @param {Function} [props.menuItems[].onClick] - Click callback receiving { closeMenu, anchorEl }
 * @param {boolean} [props.menuItems[].disabled=false] - Disable menu item
 * @param {Object} props.otherProps - Additional props passed to the Paper component
 * @returns {JSX.Element|null} Content panel component
 *
 * @example
 * <ContentPanel
 *   title="Job Planner"
 *   isLoading={false}
 *   componentName="JobPlanner"
 * >
 *   <JobPlannerContent />
 * </ContentPanel>
 */
export default function ContentPanel({
  children,
  title,
  elevation = 3,
  titleTypography = { xs: "h6", sm: "h6" },
  titleColor = "primary",
  titleAlign = "center",
  titleMarginBottom = 2,
  square = true,
  componentName,
  isLoading = false,
  isError = false,
  error = null,
  loadingMessage,
  loadingVariant = "minimal",
  paperSx,
  contentGridSx,
  visible = true,
  enableMenu = false,
  menuItems = [],
  ...otherProps
}) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  if (!visible) {
    return null;
  }

  const simpleLoadingCaption =
    loadingMessage != null && String(loadingMessage).trim() !== ""
      ? loadingMessage
      : "Loading…";

  return (
    <Paper
      elevation={elevation}
      sx={{
        padding: 2,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...paperSx,
      }}
      square={square}
      {...otherProps}
    >
      {enableMenu && menuItems.length > 0 && (
        <>
          <IconButton
            id="contentPanel_menu_button"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            aria-controls={Boolean(menuAnchor) ? "contentPanel_menu" : undefined}
            aria-haspopup="true"
            aria-expanded={Boolean(menuAnchor) ? "true" : undefined}
            sx={{ position: "absolute", top: "10px", right: "10px" }}
          >
            <MoreVertIcon size="small" color="primary" />
          </IconButton>
          <Menu
            id="contentPanel_menu"
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            slotProps={{
              list: {
                "aria-labelledby": "contentPanel_menu_button",
              },
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
      <Grid 
        container 
        sx={{ 
          width: "100%",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {title && (
          <Grid sx={{ marginBottom: titleMarginBottom }} size={12}>
            <Typography
              color={titleColor}
              align={titleAlign}
              sx={{ typography: titleTypography }}
            >
              {title}
            </Typography>
          </Grid>
        )}
        <Grid 
          size={12} 
          sx={{ 
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            ...contentGridSx,
          }}
        >
          <ContentErrorBoundary
            componentName={componentName || title || "Unknown Content Panel"}
          >
            {isLoading || isError ? (
              isError ? (
                <PanelFallBack
                  isLoading={false}
                  isError={isError}
                  error={error}
                />
              ) : loadingVariant === "simple" ? (
                <LoadingPage
                  variant="simple"
                  helperText={simpleLoadingCaption}
                />
              ) : (
                <PanelFallBack
                  isLoading={isLoading}
                  isError={false}
                  error={error}
                  loadingMessage={loadingMessage}
                />
              )
            ) : (
              children
            )}
          </ContentErrorBoundary>
        </Grid>
      </Grid>
    </Paper>
  );
}
