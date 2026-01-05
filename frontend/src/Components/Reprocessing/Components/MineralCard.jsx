import {
  Avatar,
  Box,
  Card,
  Chip,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import MarketDataIconButton from "../../../Styled Components/IconButton/marketData";
import MarketHistoryIconButton from "../../../Styled Components/IconButton/marketHistory";
import AssetsIconButton from "../../../Styled Components/IconButton/assets";
import useUsersStore from "../../../Zustand/usersStore";
import { reprocessingItemTypes } from "../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";

export default function MineralCard({
  mineralKey,
  matchedName,
  item,
  quantity,
  unitPrice,
  reprocessingCostPerUnit,
  totalValue,
  isRequestedMineral,
  isExcessMineral,
  pageState,
}) {
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));

  if (isMobile) {
    // Mobile layout - horizontal card
    return (
      <Card
        sx={{
          background: isRequestedMineral
            ? (theme) =>
                `linear-gradient(135deg, ${theme.palette.success.main}20 0%, ${theme.palette.success.light}10 100%)`
            : isExcessMineral
            ? (theme) =>
                `linear-gradient(135deg, ${theme.palette.warning.main}20 0%, ${theme.palette.warning.light}10 100%)`
            : "transparent",
          border: isRequestedMineral
            ? (theme) => `2px solid ${theme.palette.success.main}`
            : isExcessMineral
            ? (theme) => `2px solid ${theme.palette.warning.main}`
            : (theme) => `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          p: 1.5,
          mb: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
          position: "relative",
          minHeight: 80,
          height: 80,
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Requested Badge */}
        {isRequestedMineral && (
          <Chip
            label="Requested"
            size="small"
            color="success"
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              fontSize: "0.6rem",
            }}
          />
        )}

        {/* To Be Sold Badge */}
        {isExcessMineral && (
          <Chip
            label="To Be Sold"
            size="small"
            color="warning"
            sx={{
              position: "absolute",
              top: 4,
              right: isRequestedMineral ? 80 : 4,
              fontSize: "0.6rem",
            }}
          />
        )}

        {/* Mineral Icon */}
        <Tooltip title={`${matchedName} icon`} arrow placement="top">
          <Avatar
            src={`https://images.evetech.net/types/${mineralKey}/icon?size=32`}
            sx={{ width: 40, height: 40, flexShrink: 0 }}
          />
        </Tooltip>

        {/* Mineral Info */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: isRequestedMineral || isExcessMineral ? 600 : 400,
              color: isRequestedMineral
                ? "success.dark"
                : isExcessMineral
                ? "warning.dark"
                : "text.primary",
              mb: 0.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {matchedName}
          </Typography>

          {/* Quantity */}
          {item.itemType !== reprocessingItemTypes.gas && (
            <Tooltip
              title="Base Quantity | Reprocessed Quantity per unit"
              arrow
              placement="top"
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
              >
                {formatNumberForLocale(item.materials[mineralKey], { max: 0 })}{" "}
                | {formatNumberForLocale(quantity, { max: 0 })}
              </Typography>
            </Tooltip>
          )}

          {/* Price */}
          <Box sx={{ display: "flex", gap: 1, mt: 0.5, overflow: "hidden" }}>
            <Tooltip
              title="Market Price | Reprocessing Value"
              arrow
              placement="top"
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
              >
                {formatNumberForLocale(unitPrice)} |{" "}
                {formatNumberForLocale(reprocessingCostPerUnit)} ISK
              </Typography>
            </Tooltip>
            <Tooltip title="Total Value" arrow placement="top">
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
              >
                {formatNumberForLocale(totalValue)} ISK
              </Typography>
            </Tooltip>
          </Box>
        </Box>
      </Card>
    );
  }

  // Desktop layout - vertical card
  return (
    <Card
      sx={{
        minHeight: 280,
        height: 280,
        background: isRequestedMineral
          ? (theme) =>
              `linear-gradient(135deg, ${theme.palette.success.main}20 0%, ${theme.palette.success.light}10 100%)`
          : isExcessMineral
          ? (theme) =>
              `linear-gradient(135deg, ${theme.palette.warning.main}20 0%, ${theme.palette.warning.light}10 100%)`
          : "transparent",
        border: isRequestedMineral
          ? (theme) => `2px solid ${theme.palette.success.main}`
          : isExcessMineral
          ? (theme) => `2px solid ${theme.palette.warning.main}`
          : (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 3,
        p: 2,
        position: "relative",
        overflow: "hidden",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        boxSizing: "border-box",
      }}
    >
      {/* Requested Badge */}
      {isRequestedMineral && (
        <Chip
          label="Requested"
          size="small"
          color="success"
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            fontSize: "0.7rem",
          }}
        />
      )}

      {/* To Be Sold Badge */}
      {isExcessMineral && (
        <Chip
          label="To Be Sold"
          size="small"
          color="warning"
          sx={{
            position: "absolute",
            top: 8,
            right: isRequestedMineral ? 100 : 8,
            fontSize: "0.7rem",
          }}
        />
      )}

      {/* Mineral Icon */}
      <Tooltip title={`${matchedName} icon`} arrow placement="top">
        <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
          <Avatar
            src={`https://images.evetech.net/types/${mineralKey}/icon?size=32`}
            sx={{ width: 48, height: 48 }}
          />
        </Box>
      </Tooltip>

      {/* Mineral Name */}
      <Typography
        variant="subtitle2"
        sx={{
          textAlign: "center",
          fontWeight: isRequestedMineral || isExcessMineral ? 600 : 400,
          color: isRequestedMineral
            ? "success.dark"
            : isExcessMineral
            ? "warning.dark"
            : "text.primary",
          mb: 0.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {matchedName}
      </Typography>

      {/* Quantity Display */}
      {item.itemType !== reprocessingItemTypes.gas && (
        <Tooltip
          title="Base Quantity | Reprocessed Quantity per unit"
          arrow
          placement="top"
        >
          <Box sx={{ textAlign: "center", mb: 1 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              {formatNumberForLocale(item.materials[mineralKey], { max: 0 })} |{" "}
              {formatNumberForLocale(quantity, { max: 0 })}
            </Typography>
          </Box>
        </Tooltip>
      )}

      {/* Spacer to push content to top and bottom */}
      <Box sx={{ flex: 1 }} />

      {/* Price & Value */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          bgcolor: "action.hover",
          borderRadius: 1,
          p: 1,
          mb: 1,
        }}
      >
        <Tooltip
          title="Market Price | Reprocessing Value"
          arrow
          placement="top"
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center" }}
          >
            {formatNumberForLocale(unitPrice)} |{" "}
            {formatNumberForLocale(reprocessingCostPerUnit)} ISK
          </Typography>
        </Tooltip>
        <Tooltip title="Total Value" arrow placement="top">
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, textAlign: "center" }}
          >
            {formatNumberForLocale(totalValue)} ISK
          </Typography>
        </Tooltip>
      </Box>

      {/* Icon buttons at bottom of card */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: 0.5,
          mt: 1,
          pt: 1,
          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <MarketDataIconButton
          itemTypeID={mineralKey}
          locationID={pageState.marketLocation}
          iconButtonStyle={{ size: "small" }}
        />
        <MarketHistoryIconButton
          itemTypeID={mineralKey}
          regionID={pageState.marketLocation}
          iconButtonStyle={{ size: "small" }}
        />
        {useUsersStore.getState().users.isLoggedIn && (
          <AssetsIconButton
            materialTypeID={mineralKey}
            iconButtonStyle={{ size: "small" }}
          />
        )}
      </Box>
    </Card>
  );
}
