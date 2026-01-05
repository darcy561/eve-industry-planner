import { Paper, Typography, Grid } from "@mui/material";

import ContentErrorBoundary from "./ContentErrorBoundary";
import PanelFallBack from "./panelStates";

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
 * @param {Object} [props.paperSx] - Additional styles for the Paper component
 * @param {Object} props.otherProps - Additional props passed to the Paper component
 * @returns {JSX.Element} Content panel component
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
  paperSx,
  ...otherProps
}) {
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
          }}
        >
          <ContentErrorBoundary
            componentName={componentName || title || "Unknown Content Panel"}
          >
            {isLoading || isError ? (
              <PanelFallBack
                isLoading={isLoading}
                isError={isError}
                error={error}
              />
            ) : (
              children
            )}
          </ContentErrorBoundary>
        </Grid>
      </Grid>
    </Paper>
  );
}
