import { Box, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import ContentErrorBoundary from "../Paper/ContentErrorBoundary";
import PanelFallBack from "../Paper/panelStates";

/**
 * Reusable MUI dialog shell with the same building blocks as `ContentPanel` (see `Styled Components/Paper/ContentPanel.jsx`):
 * optional title, optional helper copy below the title, error boundary, optional loading/error fallback, and `DialogActions`.
 *
 * **Form layout:** pass `formProps` to wrap `DialogContent` + `DialogActions` in a single `<form>`
 * (e.g. `action` for React 19 / `useFormStatus`). Pass `formKey` to remount the form. Omit `formProps`
 * for the default layout: title → helper → content → actions as separate MUI sections.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {(event: object, reason: string) => void} props.onClose - Passed to MUI `Dialog`
 * @param {React.ReactNode} props.children - Main body (inside `ContentErrorBoundary` within `DialogContent`)
 * @param {React.ReactNode} [props.title] - Renders `DialogTitle` when truthy
 * @param {Object} [props.dialogTitleProps] - Spread onto `DialogTitle`
 * @param {React.ReactNode} [props.helperArea] - Optional copy between title and body (e.g. help / disclaimers)
 * @param {Object} [props.helperAreaSx] - Merged into the helper wrapper `Box` `sx`
 * @param {Object} [props.helperAreaProps] - Spread onto the helper wrapper `Box`
 * @param {React.ReactNode} [props.actions] - Renders a `DialogActions` row when truthy
 * @param {Object} [props.dialogActionsProps] - Spread onto `DialogActions`
 * @param {Object} [props.formProps] - When set, spreads onto a wrapping `Box component="form"` around content + actions (`action`, `noValidate`, etc.). Do not pass `key` here; use `formKey`.
 * @param {string|number} [props.formKey] - React `key` on the form `Box` (remount on reset)
 * @param {string} [props.componentName] - `ContentErrorBoundary` label
 * @param {boolean} [props.isLoading=false]
 * @param {boolean} [props.isError=false]
 * @param {Error} [props.error]
 * @param {string} [props.loadingMessage]
 * @param {import("@mui/material").DialogProps["maxWidth"]} [props.maxWidth="sm"]
 * @param {boolean} [props.fullWidth=false]
 * @param {Object} [props.dialogSx] - `sx` on root `Dialog`
 * @param {Object} [props.slotProps] - `Dialog` `slotProps`
 * @param {Object} [props.dialogContentProps] - Extra props for `DialogContent`
 * @param {Object} [props.dialogContentSx] - `sx` for `DialogContent`
 * Remaining props are forwarded to MUI `Dialog`.
 */
export default function ContentDialog({
  open,
  onClose,
  children,
  title,
  dialogTitleProps = {},
  helperArea,
  helperAreaSx,
  helperAreaProps = {},
  actions,
  dialogActionsProps = {},
  formProps,
  formKey,
  componentName,
  isLoading = false,
  isError = false,
  error = null,
  loadingMessage,
  maxWidth = "sm",
  fullWidth = false,
  dialogSx,
  slotProps,
  dialogContentProps = {},
  dialogContentSx,
  ...rest
}) {
  const boundaryName =
    componentName || (typeof title === "string" ? title : "ContentDialog");

  const dialogContent = (
    <DialogContent
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...dialogContentSx,
      }}
      {...dialogContentProps}
    >
      <ContentErrorBoundary componentName={boundaryName}>
        {isLoading || isError ? (
          <PanelFallBack
            isLoading={isLoading}
            isError={isError}
            error={error}
            loadingMessage={loadingMessage}
          />
        ) : (
          children
        )}
      </ContentErrorBoundary>
    </DialogContent>
  );

  const dialogActions =
    actions != null && actions !== false ? (
      <DialogActions {...dialogActionsProps}>{actions}</DialogActions>
    ) : null;

  let body;
  if (formProps != null && typeof formProps === "object") {
    const { sx: formSx, ...formSpread } = formProps;
    body = (
      <Box
        key={formKey}
        component="form"
        {...formSpread}
        sx={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          width: "100%",
          ...formSx,
        }}
      >
        {dialogContent}
        {dialogActions}
      </Box>
    );
  } else {
    body = (
      <>
        {dialogContent}
        {dialogActions}
      </>
    );
  }

  const helper =
    helperArea != null && helperArea !== false ? (
      <Box
        component="div"
        {...helperAreaProps}
        sx={{
          px: 2,
          pt: 0,
          pb: 1,
          ...helperAreaSx,
        }}
      >
        {helperArea}
      </Box>
    ) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      sx={dialogSx}
      slotProps={slotProps}
      {...rest}
    >
      {title ? (
        <DialogTitle
          color="primary"
          align="center"
          {...dialogTitleProps}
        >
          {title}
        </DialogTitle>
      ) : null}
      {helper}
      {body}
    </Dialog>
  );
}

export { useDialogEventState } from "./useDialogEventState";
export { useSyncedDialogEventState } from "./useSyncedDialogEventState";
export { DialogCloseAction } from "./DialogCloseAction";
