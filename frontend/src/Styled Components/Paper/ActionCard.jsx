import { Box, Divider, Link, Paper, Stack, Typography } from "@mui/material";

import { appShellNestedCardSx } from "../../Context/appShell";
import { activateOnEnterOrSpace } from "./cardActivation";

/**
 * A card that acts: it follows a link, or runs an action, or states something
 * there is nothing to do about.
 *
 * `SelectableCard`'s sibling. That one is a card a player picks, so it carries
 * a radio or checkbox role and a selected state; this one carries a link or a
 * button role and has no state of its own. They share the nested-card surface
 * so a card that acts and a card that is chosen read as the same object.
 *
 * The whole card is the control, so the hit area matches what a reader thinks
 * they are pressing, and the keyboard reaches it the same way the pointer does.
 *
 * With neither `href` nor `onAction` the card is inert — it renders as plain
 * content with no role, because a control a reader cannot use should not be
 * announced as one.
 *
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.children] - what the card says under its title
 * @param {React.ReactNode} [props.icon] - shown in the bookend, beside the text
 * @param {string} [props.href] - followed in a new tab
 * @param {() => void} [props.onAction] - run when there is no href
 * @param {boolean} [props.muted] - dim an inert card whose action is unavailable
 * @param {object} [props.sx]
 */
export default function ActionCard({
  title,
  children,
  icon,
  href,
  onAction,
  muted = false,
  sx,
  ...rest
}) {
  const inert = !href && !onAction;

  const surfaceSx = [
    {
      ...appShellNestedCardSx,
      overflow: "hidden",
      ...(inert && muted ? { opacity: 0.72 } : {}),
    },
    ...(Array.isArray(sx) ? sx : [sx]),
  ];

  const interactiveSx = (theme) => ({
    textDecoration: "none",
    color: "inherit",
    display: "block",
    cursor: "pointer",
    transition: theme.transitions.create(["background-color", "border-color"], {
      duration: theme.transitions.duration.shortest,
    }),
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
      borderColor: theme.palette.primary.main,
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
    },
  });

  const body = (
    <Stack direction="row" sx={{ alignItems: "stretch", minHeight: 72 }}>
      {icon ? (
        <>
          <Box
            sx={{
              width: 56,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pr: 1,
            }}
          >
            {icon}
          </Box>
          <Divider orientation="vertical" flexItem />
        </>
      ) : null}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          pl: icon ? 1.5 : 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          py: 0.25,
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
          {title}
        </Typography>
        {children}
      </Box>
    </Stack>
  );

  if (href) {
    return (
      <Paper
        component={Link}
        href={href}
        target="_blank"
        rel="noreferrer"
        variant="outlined"
        underline="none"
        aria-label={`${title} (opens in a new tab)`}
        sx={[...surfaceSx, interactiveSx]}
        {...rest}
      >
        {body}
      </Paper>
    );
  }

  if (onAction) {
    return (
      <Paper
        variant="outlined"
        role="button"
        tabIndex={0}
        onClick={onAction}
        onKeyDown={activateOnEnterOrSpace(onAction)}
        aria-label={`${title} (opens dialogue)`}
        sx={[...surfaceSx, interactiveSx]}
        {...rest}
      >
        {body}
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={surfaceSx} {...rest}>
      {body}
    </Paper>
  );
}
