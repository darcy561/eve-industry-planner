import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from "@mui/material";

export function SidemenuButtonTemplate_Default({
  buttonContent,
  expandedState,
}) {
  const { displayText, icon, onClick, tooltip, disabled, divider, hoverColor } =
    buttonContent;
  return (
    <Tooltip title={tooltip} arrow placement="right">
      <ListItem
        disablePadding
        divider={divider}
        sx={{
          display: "block",
          "&:hover": {
            ...(disabled
              ? {}
              : {
                  "& .MuiListItemIcon-root, & .MuiListItemText-root": {
                    color: hoverColor ? hoverColor : "primary.main",
                  },
                }),
          },
        }}
        onClick={onClick}
      >
        <ListItemButton
          disabled={disabled}
          sx={{
            minHeight: 48,
            justifyContent: expandedState ? "initial" : "center",
            paddingRight: 2.5,
            paddingLeft: 2.5,
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 0,
              marginRight: expandedState ? 3 : "auto",
              justifyContent: "center",
            }}
          >
            {icon}
          </ListItemIcon>
          <ListItemText
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayText}
          </ListItemText>
        </ListItemButton>
      </ListItem>
    </Tooltip>
  );
}
