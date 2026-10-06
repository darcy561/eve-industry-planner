import { Box, Drawer, Typography } from "@mui/material";

/**
 * A MUI `Drawer` rising from the foot of a phone screen, with a handle and an optional title, for
 * a choice or an editor that would otherwise open against the edge of a 360px screen.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} props.children
 * @param {object} [props.contentProps] - Spread onto the box holding the children
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  contentProps,
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            maxHeight: "90vh",
          },
        },
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 4,
          borderRadius: 2,
          bgcolor: "divider",
          mx: "auto",
          mt: 1,
        }}
      />
      {title ? (
        <Typography variant="subtitle1" sx={{ px: 2, pt: 1 }}>
          {title}
        </Typography>
      ) : null}
      <Box {...contentProps} sx={{ pb: 2, ...contentProps?.sx }}>
        {children}
      </Box>
    </Drawer>
  );
}
