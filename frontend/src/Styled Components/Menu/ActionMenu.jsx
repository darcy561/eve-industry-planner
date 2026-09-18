import { useId, useState } from "react";
import { IconButton, ListItemText, Menu, MenuItem } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";

/**
 * The overflow menu of the app-shell design: a set of actions declared as data, opened from one
 * button.
 *
 * Adding an action is a table entry rather than a change to whatever is carrying the menu, and an
 * action with nothing behind it yet is listed carrying its `disabledReason` rather than left out —
 * a reader can then see the difference between a control that is waiting on something and one that
 * is broken. The reason is rendered under the label rather than in a tooltip, because a disabled
 * item takes no pointer events and a tooltip on one never opens.
 *
 * An action marked `destructive` is coloured for it and sits last: the menu is where an occasional
 * or destructive action belongs, and a reader about to remove something should see that they are.
 *
 * @param {Object} props
 * @param {Array<{label: string, onClick?: Function, disabled?: boolean, disabledReason?: string, destructive?: boolean}>} props.items
 * @param {string} props.label - accessible name for the button, naming what the actions act on
 * @param {'small'|'medium'|'large'} [props.size]
 * @param {Object} [props.sx]
 */
export default function ActionMenu({ items, label, size = "small", sx }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const buttonId = useId();
  const menuId = useId();

  if (!items?.length) return null;

  return (
    <>
      <IconButton
        id={buttonId}
        size={size}
        aria-label={label}
        aria-controls={menuAnchor ? menuId : undefined}
        aria-haspopup="true"
        aria-expanded={menuAnchor ? "true" : undefined}
        onClick={(event) => setMenuAnchor(event.currentTarget)}
        sx={sx}
      >
        <MoreVertIcon
          fontSize={size === "large" ? "medium" : "small"}
          color="primary"
        />
      </IconButton>
      <Menu
        id={menuId}
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        slotProps={{ list: { "aria-labelledby": buttonId } }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.label}
            disabled={item.disabled || false}
            sx={item.destructive ? { color: "error.main" } : undefined}
            onClick={() => {
              item.onClick?.({
                closeMenu: () => setMenuAnchor(null),
                anchorEl: menuAnchor,
              });
              setMenuAnchor(null);
            }}
          >
            <ListItemText
              primary={item.label}
              secondary={item.disabled ? item.disabledReason : undefined}
              slotProps={{ secondary: { variant: "caption" } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
