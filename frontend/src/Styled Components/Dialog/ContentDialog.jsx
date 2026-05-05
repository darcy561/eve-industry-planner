import { Suspense } from "react";
import { Box, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import Skeleton from "@mui/material/Skeleton";
import { alpha } from "@mui/material/styles";
import ContentErrorBoundary from "../Paper/ContentErrorBoundary";
import PanelFallBack from "../Paper/panelStates";

function DefaultDialogLoadingSkeleton({ loadingVariant = "default" }) {
  if (loadingVariant === "dense") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </Box>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Skeleton variant="text" width="55%" />
      <Skeleton variant="rounded" height={56} />
      <Skeleton variant="rounded" height={56} />
      <Skeleton variant="rounded" height={84} />
      <Skeleton variant="text" width="90%" />
    </Box>
  );
}

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
  asyncState,
  isLoading = false,
  isError = false,
  error = null,
  loadingMessage,
  loadingVariant = "default",
  loadingSkeleton,
  actionLayout = "end",
  withSuspense = false,
  suspenseFallback,
  useAppShellDesign = false,
  maxWidth = "sm",
  fullWidth = false,
  dialogSx,
  slotProps,
  dialogContentProps = {},
  dialogContentSx,
  ...rest
}) {
  const resolvedIsLoading = asyncState?.isLoading ?? isLoading;
  const resolvedIsError = asyncState?.isError ?? isError;
  const resolvedError = asyncState?.error ?? error;
  const resolvedLoadingMessage = asyncState?.loadingMessage ?? loadingMessage;
  const boundaryName =
    componentName || (typeof title === "string" ? title : "ContentDialog");
  const mergedSlotProps = {
    ...slotProps,
    paper: {
      ...(slotProps?.paper || {}),
      ...(useAppShellDesign
        ? {
            elevation:
              slotProps?.paper?.elevation != null
                ? slotProps.paper.elevation
                : 0,
          }
        : {}),
      sx: {
        ...(useAppShellDesign
          ? {
              borderRadius: 3,
              border: (theme) =>
                `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              // Solid theme paper (default dialog surface); keep border + outer glow only.
              backgroundColor: (theme) => theme.palette.background.paper,
              backgroundImage: "none",
              backdropFilter: "none",
            }
          : {}),
        ...(slotProps?.paper?.sx || {}),
      },
    },
  };

  const contentSuspenseFallback = useAppShellDesign ? (
    loadingSkeleton || (
      <DefaultDialogLoadingSkeleton loadingVariant={loadingVariant} />
    )
  ) : (
    <PanelFallBack
      isLoading
      isError={false}
      loadingMessage={resolvedLoadingMessage}
    />
  );

  const dialogContent = (
    <DialogContent
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...(useAppShellDesign
          ? {
              px: { xs: 2, md: 3 },
              py: 2,
            }
          : {}),
        ...dialogContentSx,
      }}
      {...dialogContentProps}
    >
      <ContentErrorBoundary componentName={boundaryName}>
        {resolvedIsLoading || resolvedIsError ? (
          resolvedIsLoading ? (
            useAppShellDesign ? (
              loadingSkeleton || (
                <DefaultDialogLoadingSkeleton loadingVariant={loadingVariant} />
              )
            ) : (
              <PanelFallBack
                isLoading
                isError={false}
                loadingMessage={resolvedLoadingMessage}
              />
            )
          ) : (
            <PanelFallBack
              isLoading={false}
              isError={resolvedIsError}
              error={resolvedError}
              loadingMessage={resolvedLoadingMessage}
            />
          )
        ) : (
          <Suspense fallback={contentSuspenseFallback}>{children}</Suspense>
        )}
      </ContentErrorBoundary>
    </DialogContent>
  );

  const dialogActions =
    actions != null && actions !== false ? (
      <DialogActions
        {...dialogActionsProps}
        sx={{
          ...(useAppShellDesign
            ? {
                px: { xs: 2, md: 3 },
                py: 1.5,
                borderTop: (theme) =>
                  `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              }
            : {}),
          justifyContent:
            actionLayout === "split"
              ? "space-between"
              : actionLayout === "start"
                ? "flex-start"
                : "flex-end",
          ...dialogActionsProps?.sx,
        }}
      >
        {actions}
      </DialogActions>
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
          px: useAppShellDesign ? { xs: 2, md: 3 } : 2,
          pt: 0,
          pb: useAppShellDesign ? 1.5 : 1,
          ...(useAppShellDesign
            ? {
                borderBottom: (theme) =>
                  `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              }
            : {}),
          ...helperAreaSx,
        }}
      >
        {helperArea}
      </Box>
    ) : null;

  const appShellDialogSx = useAppShellDesign
    ? {
        "& .MuiDialog-paper": {
          boxShadow: (theme) =>
            `0 18px 50px ${alpha(theme.palette.common.black, 0.35)}, 0 0 0 1px ${alpha(theme.palette.primary.main, 0.2)}, 0 0 30px ${alpha(theme.palette.primary.main, 0.18)}`,
        },
        "& .MuiBackdrop-root": {
          backgroundImage: (theme) =>
            `radial-gradient(circle at 50% 40%, ${alpha(theme.palette.primary.main, 0.12)}, transparent 65%)`,
        },
      }
    : null;

  const dialogNode = (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      sx={[appShellDialogSx, dialogSx]}
      slotProps={mergedSlotProps}
      {...rest}
    >
      {title ? (
        <DialogTitle
          color={useAppShellDesign ? "text.primary" : "primary"}
          align="center"
          sx={{
            ...(useAppShellDesign
              ? {
                  px: { xs: 2, md: 3 },
                  py: 2,
                  borderBottom: (theme) =>
                    `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                }
              : {}),
            ...dialogTitleProps?.sx,
          }}
          {...dialogTitleProps}
        >
          {title}
        </DialogTitle>
      ) : null}
      {helper}
      {body}
    </Dialog>
  );

  if (withSuspense) {
    const defaultSuspenseFallback = (
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth={maxWidth}
        fullWidth={fullWidth}
        sx={[appShellDialogSx, dialogSx]}
        slotProps={mergedSlotProps}
        {...rest}
      >
        {title ? (
          <DialogTitle color="primary" align="center" {...dialogTitleProps}>
            {title}
          </DialogTitle>
        ) : null}
        {helper}
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            ...(useAppShellDesign
              ? {
                  px: { xs: 2, md: 3 },
                  py: 2,
                }
              : {}),
            ...dialogContentSx,
          }}
          {...dialogContentProps}
        >
          {useAppShellDesign ? (
            loadingSkeleton || (
              <DefaultDialogLoadingSkeleton loadingVariant={loadingVariant} />
            )
          ) : (
            <PanelFallBack
              isLoading
              isError={false}
              loadingMessage={resolvedLoadingMessage}
            />
          )}
        </DialogContent>
        {dialogActions}
      </Dialog>
    );
    return (
      <Suspense fallback={suspenseFallback ?? defaultSuspenseFallback}>
        {dialogNode}
      </Suspense>
    );
  }
  return dialogNode;
}

export { useDialogEventState } from "./useDialogEventState";
export { useSyncedDialogEventState } from "./useSyncedDialogEventState";
export { DialogCloseAction } from "./DialogCloseAction";
export { useDialogCloseReset } from "./useDialogCloseReset";
