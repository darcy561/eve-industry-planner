import {
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "../../Context/appShell";

/**
 * Window presets, as a count of months back from the current one.
 *
 * Presets rather than two month pickers: the ranges people actually ask for are
 * "recently" and "all of it", and a pair of pickers makes the common case the
 * fiddly one. `null` means no range, which is how a caller asks the server to
 * choose — the current month and the one before.
 */
export const ARCHIVE_RANGES = [
  { key: "default", label: "This month & last", months: null },
  { key: "6m", label: "Last 6 months", months: 6 },
  { key: "12m", label: "Last 12 months", months: 12 },
  { key: "24m", label: "Last 24 months", months: 24 },
];

/** `YYYY-MM` for a date. */
function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Resolves a preset into the range the statistics views accept.
 *
 * Both bounds travel together or neither does: the API rejects half a range
 * rather than filling in the missing bound.
 *
 * @param {string} key
 * @param {Date} [now]
 * @returns {{from?: string, to?: string}}
 */
export function resolveArchiveRange(key, now = new Date()) {
  const preset = ARCHIVE_RANGES.find((option) => option.key === key);
  if (!preset?.months) return {};

  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (preset.months - 1), 1),
  );
  return { from: monthKey(from), to: monthKey(to) };
}

/**
 * The window every panel on the page reads, so one selection drives them all.
 *
 * @param {Object} props
 * @param {string} props.value
 * @param {(key: string) => void} props.onChange
 */
export function ArchiveRangeControl({ value, onChange }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary">
        Period
      </Typography>
      <FormControl
        size="small"
        sx={(t) => ({ ...appShellOutlinedFormControl(t), minWidth: 200 })}
      >
        <Select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          MenuProps={getAppShellSelectMenuProps(theme)}
        >
          {ARCHIVE_RANGES.map((option) => (
            <MenuItem key={option.key} value={option.key}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}

export default ArchiveRangeControl;
