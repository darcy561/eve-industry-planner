import { Box, Collapse } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ExpandToggle } from "../IconButton/ExpandToggle";

/**
 * The tint a row takes while it is open or is the one being worked on, the same one a selected
 * table row takes, so a list and a table mark it alike.
 *
 * @param {import("@mui/material/styles").Theme} theme
 * @returns {string}
 */
export function openRowBackground(theme) {
  return alpha(
    theme.palette.primary.main,
    theme.palette.action.selectedOpacity,
  );
}

/**
 * A row that opens what sits beneath it by a press anywhere on it or on its chevron, ignoring
 * presses on the controls it carries.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onToggle
 * @param {string} props.showLabel - What opening it does, for a screen reader
 * @param {string} props.hideLabel - What shutting it does
 * @param {React.ReactNode} props.children - The row's own content
 * @param {React.ReactNode} [props.actions] - Controls after the chevron, which do not open the row
 * @param {React.ReactNode} [props.drawer] - What opens beneath it, mounted only while open
 * @param {boolean} [props.expandable=true] - False for a row with nothing to open
 * @param {boolean} [props.selected] - Tinted while shut, as the one the page is working with
 * @param {object} [props.sx] - On the row itself
 */
export default function ExpandableRow({
  isOpen,
  onToggle,
  showLabel,
  hideLabel,
  children,
  actions,
  drawer,
  expandable = true,
  selected = false,
  sx,
}) {
  return (
    <Box>
      <Box
        onClick={expandable ? onToggle : undefined}
        sx={[
          {
            display: "flex",
            alignItems: "center",
            gap: 1,
            cursor: expandable ? "pointer" : "default",
          },
          (isOpen || selected) && {
            backgroundColor: openRowBackground,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
        {expandable ? (
          <ExpandToggle
            isOpen={isOpen}
            onToggle={onToggle}
            showLabel={showLabel}
            hideLabel={hideLabel}
          />
        ) : null}
        {actions ? (
          <Box
            onClick={(event) => event.stopPropagation()}
            sx={{ display: "flex", alignItems: "center" }}
          >
            {actions}
          </Box>
        ) : null}
      </Box>
      {drawer !== undefined ? (
        <Collapse in={isOpen} unmountOnExit>
          {drawer}
        </Collapse>
      ) : null}
    </Box>
  );
}
