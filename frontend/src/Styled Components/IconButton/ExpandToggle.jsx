import { IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * The chevron button that opens and shuts a drawer or section, pointing down while shut and up
 * while open.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onToggle
 * @param {string} props.showLabel - What opening it does, for a screen reader
 * @param {string} props.hideLabel - What shutting it does
 */
export function ExpandToggle({ isOpen, onToggle, showLabel, hideLabel }) {
  return (
    <IconButton
      size="small"
      aria-label={isOpen ? hideLabel : showLabel}
      aria-expanded={isOpen}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      sx={{
        p: 0.25,
        color: "text.secondary",
        transform: isOpen ? "rotate(180deg)" : "none",
        transition: (theme) =>
          theme.transitions.create("transform", {
            duration: theme.transitions.duration.shortest,
          }),
      }}
    >
      <ExpandMoreIcon fontSize="small" />
    </IconButton>
  );
}
