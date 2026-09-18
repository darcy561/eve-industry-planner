import { Box, Stack, Typography } from "@mui/material";

import { COLLECTION_STATE } from "../../Functions/EveESI/prefetch/collectionStatus";
import { formatTimeSince } from "../../Functions/Helper/numberParser";
import InsetSurface from "../../Styled Components/Paper/InsetSurface";
import StatusChip, {
  STATUS_TONE,
} from "../../Styled Components/Chip/statusChip";

/** How each state is named, and what stands in for an age when there is none. */
const STATE_MARKER = {
  [COLLECTION_STATE.FRESH]: { label: "fresh", tone: STATUS_TONE.GOOD },
  [COLLECTION_STATE.STALE]: { label: "stale", tone: STATUS_TONE.WARN },
  [COLLECTION_STATE.ON_DEMAND]: {
    label: "on demand",
    tone: STATUS_TONE.NEUTRAL,
    instead: "fetched when opened",
  },
  [COLLECTION_STATE.MISSING]: {
    label: "not held",
    tone: STATUS_TONE.NEUTRAL,
    instead: "not fetched this session",
  },
  [COLLECTION_STATE.UNAVAILABLE]: {
    label: "unavailable",
    tone: STATUS_TONE.WARN,
    instead: "no access",
  },
  [COLLECTION_STATE.FAILED]: {
    label: "failed",
    tone: STATUS_TONE.WARN,
    instead: "last fetch failed",
  },
};

/**
 * A list of ESI collections and what the application holds of each.
 *
 * @param {object} props
 * @param {Array<{key: string, name: string, state: string, at: number|null}>} props.statuses
 * @param {number} props.now - unix milliseconds, for the ages
 */
export default function EsiStatusList({ statuses, now }) {
  return (
    <InsetSurface>
      <Stack spacing={0.75}>
        {statuses.map(({ key, name, state, at }) => {
          const marker = STATE_MARKER[state];
          return (
            /* Three columns do not fit a phone: the collection and its state keep the line and
               the age drops beneath them, rather than every name being truncated to make room. */
            <Box
              key={key}
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "center",
                flexWrap: { xs: "wrap", sm: "nowrap" },
              }}
            >
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {name}
              </Typography>
              <StatusChip label={marker.label} tone={marker.tone} />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  width: { xs: "100%", sm: 150 },
                  textAlign: { xs: "left", sm: "right" },
                }}
              >
                {at ? formatTimeSince(at, { now }) : marker.instead}
              </Typography>
            </Box>
          );
        })}
        <Typography variant="caption" color="text.disabled">
          Ages cover this browsing session only — nothing yet records when a
          collection was last fetched, so one fetched before this session reads
          as not held.
        </Typography>
      </Stack>
    </InsetSurface>
  );
}
