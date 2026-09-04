import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "../../Context/appShell";
import { monthKeyFromDate } from "./calendarMonth.js";

/**
 * Window presets, as a count of months back from the current one.
 *
 * Presets rather than two month pickers: the ranges people actually ask for are
 * "recently" and "all of it", and a pair of pickers makes the common case the
 * fiddly one.
 */
export const ARCHIVE_RANGES = [
  // No bounds: the server's own window is this month and the one before, which
  // is what the label says. Sending bounds for it would be a second cache entry
  // holding the months the overview has already read.
  { key: "default", label: "Last 2 months" },
  { key: "6m", label: "Last 6 months", months: 6 },
  { key: "12m", label: "Last 12 months", months: 12 },
  { key: "24m", label: "Last 24 months", months: 24 },
  // Not a month count: a range long enough for an old account is refused for
  // exceeding the server's maximum. The server bounds this by what exists.
  { key: "all", label: "All time", all: true },
];

/**
 * Resolves a preset into the range the statistics views accept.
 *
 * Every preset but the default and all-time resolves to bounds; those two are
 * the API's own two ways of not being given a range.
 *
 * Both bounds travel together or neither does: the API rejects half a range
 * rather than filling in the missing bound.
 *
 * @param {string} key
 * @param {Date} [now]
 * @returns {{from?: string, to?: string, range?: "all"}}
 */
export function resolveArchiveRange(key, now = new Date()) {
  const preset = ARCHIVE_RANGES.find((option) => option.key === key);
  // All time carries no bounds; the API refuses the two together.
  if (preset?.all) return { range: "all" };
  if (!preset?.months) return {};

  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (preset.months - 1), 1),
  );
  return { from: monthKeyFromDate(from), to: monthKeyFromDate(to) };
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
      <FormHelperText>Period</FormHelperText>
    </FormControl>
  );
}

export default ArchiveRangeControl;
