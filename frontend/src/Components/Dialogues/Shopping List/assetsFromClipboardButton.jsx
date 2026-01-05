import { Box, Button, Tooltip, Typography } from "@mui/material";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../Events/snackbarEvents";
import importAssetsFromClipboard_IconView from "../../../Functions/Clipboard/importAssetsFromClipboard";
import { requestClipboardPermissions } from "../../../Functions/Clipboard/clipboardPermissions";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";

export function AssetsFromClipboardButton_ShoppingList({ state, actions }) {
  const shouldShowLabel =
    state.assetType === "character" ||
    state.assetType === "corporation" ||
    state.assetsImportedFromClipboard;
  const hasAppliedAssets = state.appliedAssetsCount > 0;
  const tooltipContent = hasAppliedAssets
    ? state.appliedAssetsDetails
        .map((item) => `${item.name}: ${formatNumberForLocale(item.quantity)}`)
        .join("\n")
    : state.assetsImportedFromClipboard
      ? "No assets applied from clipboard."
      : "No assets applied from the selected location.";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {shouldShowLabel && (
        <Tooltip
          title={
            hasAppliedAssets ? (
              <Box
                component="div"
                sx={{ whiteSpace: "pre-line", fontFamily: "monospace" }}
              >
                {tooltipContent}
              </Box>
            ) : (
              tooltipContent
            )
          }
          arrow
          placement="top"
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.75rem",
              color: "text.secondary",
              textAlign: "center",
              cursor: "help",
            }}
          >
            {state.appliedAssetsCount}{" "}
            {state.appliedAssetsCount === 1 ? "asset" : "assets"} applied{" "}
            <Box
              component="span"
              sx={{
                fontSize: "0.7rem",
                opacity: 0.7,
                fontStyle: "italic",
              }}
            >
              (hover for details)
            </Box>
          </Typography>
        </Tooltip>
      )}
      <Tooltip title="Import assets from clipboard." arrow placement="bottom">
        <Button
          variant="contained"
          size="small"
          sx={{ display: { xs: "none", sm: "block" } }}
          onClick={async () => {
            if (state.assetsImportedFromClipboard) {
              actions.clearImportedAssets();
              showSnackbarError("Clipboard Assets Removed");
              return;
            }

            // Request permissions on click
            const hasPermission = await requestClipboardPermissions();
            if (!hasPermission) {
              showSnackbarError(
                "Clipboard access denied. Please enable clipboard permissions in your browser settings.",
                3
              );
              return;
            }

            try {
              const importedAssets = await importAssetsFromClipboard_IconView();
              actions.importAssetsFromClipboard(importedAssets);
              showSnackbarSuccess("Clipboard Assets Applied");
            } catch (error) {
              // Handle clipboard permission errors gracefully
              if (
                error.message &&
                error.message.includes("Clipboard access denied")
              ) {
                showSnackbarError(
                  "Clipboard access denied. Please enable clipboard permissions in your browser settings.",
                  3
                );
                return;
              }
              console.error("Failed to import assets from clipboard:", error);
              showSnackbarError(
                error.message || "Failed to import assets from clipboard"
              );
            }
          }}
        >
          {state.assetsImportedFromClipboard
            ? "Remove Imported Assets"
            : "Apply Assets From Clipboard"}
        </Button>
      </Tooltip>
    </Box>
  );
}
