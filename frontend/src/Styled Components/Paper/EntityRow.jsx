import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import { appShellNestedCardSx } from "../../Context/appShell";

/**
 * One thing an account holds, drawn on the nested-card surface: a character, a corporation, a
 * planner.
 *
 * Every list on the Accounts page is built from this, so the anatomy is learnt once and read three
 * times — EVE's own artwork, the name, a line of context, the state it is in, what can be done to
 * it, and whatever detail hangs beneath. A caller supplies the pieces; the row decides where they
 * go and what they look like.
 *
 * @param {object} props
 * @param {React.ReactNode} props.avatar - an `EveImageAvatar` for the subject
 * @param {React.ReactNode} props.name
 * @param {React.ReactNode} [props.context] - the line beneath the name
 * @param {React.ReactNode} [props.status] - `StatusChip`s, before the actions
 * @param {React.ReactNode} [props.actions] - an `ActionMenu`, and anything beside it
 * @param {React.ReactNode} [props.children] - detail beneath the row, usually a `Disclosure`
 * @param {boolean} [props.selected] - the one being worked in, marked as chosen
 * @param {object} [props.sx]
 */
export default function EntityRow({
  avatar,
  name,
  context,
  status,
  actions,
  children,
  selected = false,
  sx,
  ...rest
}) {
  return (
    /* Outlined, because the shared card sx names a border colour and leaves the border itself to
       the surface. */
    <Paper
      variant="outlined"
      sx={[
        appShellNestedCardSx,
        selected && {
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.45),
          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      <Stack spacing={1}>
        {/* Wraps on a phone: the name and what acts on it keep the first line, and the state
            chips take one of their own. A name and a chip reading "Needs re-authorising" cannot
            share 360px, and shrinking either is worse than giving the chip its own line. */}
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            flexWrap: { xs: "wrap", sm: "nowrap" },
          }}
        >
          {avatar}
          <Stack spacing={0.15} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body1" noWrap sx={{ fontWeight: 600 }}>
              {name}
            </Typography>
            {context && (
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: "center", minWidth: 0 }}
              >
                {context}
              </Stack>
            )}
          </Stack>
          {status && (
            <Box
              sx={{
                display: "flex",
                gap: 0.75,
                alignItems: "center",
                flexWrap: "wrap",
                order: { xs: 3, sm: 0 },
                flexBasis: { xs: "100%", sm: "auto" },
              }}
            >
              {status}
            </Box>
          )}
          {actions}
        </Box>
        {children}
      </Stack>
    </Paper>
  );
}
