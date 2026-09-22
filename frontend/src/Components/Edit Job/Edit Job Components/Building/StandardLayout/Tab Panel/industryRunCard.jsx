import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardHeader,
  Chip,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import {
  characterImageUrl,
  corporationImageUrl,
  typeImageUrl,
} from "../../../../../../Functions/Shared/eveImage";

const UNKNOWN_CHARACTER = "Unknown Character";

/**
 * One industry run, drawn the same way whether the job holds it or ESI is
 * offering it.
 *
 * The card knows nothing about linking: it draws the row it is given and says
 * when it was pressed. Which list it sits on decides what that means, what the
 * tooltip says, and whether the press is allowed at all.
 *
 * @param {object} props
 * @param {import("./runRows").RunRow} props.row
 * @param {string} props.tooltip
 * @param {boolean} [props.disabled]
 * @param {() => void} props.onSelect
 */
export function IndustryRunCard({ row, tooltip, disabled = false, onSelect }) {
  const { run, owner } = row;

  return (
    <Tooltip title={tooltip} placement="top" arrow>
      <Card
        sx={{
          height: "100%",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          "&:hover": { boxShadow: disabled ? 1 : 6 },
          position: "relative",
          overflow: "visible",
        }}
        onClick={() => {
          if (disabled) return;
          onSelect();
        }}
      >
        <Tooltip title={`Progress: ${Math.round(row.progress)}%`} arrow>
          <LinearProgress
            variant="determinate"
            value={row.progress}
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              borderRadius: "4px 4px 0 0",
              "& .MuiLinearProgress-bar": { borderRadius: "4px 4px 0 0" },
            }}
          />
        </Tooltip>
        <CardHeader
          avatar={
            <Tooltip
              title={`Character: ${owner?.CharacterName ?? UNKNOWN_CHARACTER}`}
              arrow
            >
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                badgeContent={
                  <Avatar
                    src={characterImageUrl(owner?.CharacterID, 48)}
                    variant="circular"
                    sx={{
                      height: "24px",
                      width: "24px",
                      border: "1px solid white",
                    }}
                  />
                }
              >
                <Avatar
                  src={typeImageUrl(row.blueprintTypeID, row.blueprintType, 64)}
                  variant="square"
                  sx={{ width: 40, height: 40 }}
                />
              </Badge>
            </Tooltip>
          }
          action={
            run.is_corporation && (
              <Tooltip title="Corporation Job" arrow>
                <Avatar
                  src={corporationImageUrl(run.corporation_id, 32)}
                  sx={{
                    width: 32,
                    height: 32,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
              </Tooltip>
            )
          }
          title={
            <Typography variant="body1" noWrap>
              {formatNumberForLocale(run.runs, { max: 0 })} Runs
            </Typography>
          }
          subheader={
            <Typography
              variant="caption"
              noWrap
              sx={{ color: "text.secondary" }}
            >
              {row.facilityName}
            </Typography>
          }
        />
        <CardContent sx={{ pt: 0, pb: 0 }}>
          <Stack spacing={0.1}>
            {row.timeRemaining !== null && (
              <Typography
                variant="caption"
                align="center"
                sx={{ color: "text.secondary" }}
              >
                {row.readyToDeliver ? "Ready to Deliver" : row.timeRemaining}
              </Typography>
            )}
            {row.installCost !== null && (
              <Typography
                variant="caption"
                align="center"
                sx={{ color: "text.secondary" }}
              >
                Install Cost: {formatNumberForLocale(row.installCost)} ISK
              </Typography>
            )}
            <Chip
              label={row.statusLabel}
              color={row.statusColour}
              size="small"
              sx={{
                width: "100%",
                height: 20,
                "& .MuiChip-label": { px: 0.5 },
              }}
            />
          </Stack>
        </CardContent>
      </Card>
    </Tooltip>
  );
}

export default IndustryRunCard;
