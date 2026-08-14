import { Box, Divider, Link, Paper, Stack, Typography } from "@mui/material";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import { FaDiscord } from "react-icons/fa";
import GLOBAL_CONFIG from "../../../global-config-app";
import { openFeedbackDialog } from "../../../Events/feedbackDialogEvents";
import { getWikiUrl } from "../../../Functions/Helper/getWikiUrl";
import { FirstLoginSetupSection } from "../shared/FirstLoginSetupSection";

const bookendCardInteractiveSx = {
  textDecoration: "none",
  color: "inherit",
  display: "block",
  cursor: "pointer",
  transition: (theme) =>
    theme.transitions.create(["background-color", "border-color"], {
      duration: theme.transitions.duration.shortest,
    }),
  "&:hover": {
    bgcolor: "action.hover",
    borderColor: "primary.main",
  },
  "&:focus-visible": {
    outline: (theme) => `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
};

function SupportBookendCard({
  title,
  bookendIcon,
  children,
  /** When set, the entire card opens this URL in a new tab. */
  href,
  /** When set (and no `href`), the whole card acts as a button (e.g. open feedback dialog). */
  onAction,
  /** When true and `href` is missing, the card is visibly inactive (e.g. forum not configured). */
  inactiveWithoutHref = false,
}) {
  const interactive = Boolean(href) || Boolean(onAction);
  const inactive = inactiveWithoutHref && !href && !onAction;

  const inner = (
    <Stack
      direction="row"
      spacing={0}
      sx={{ alignItems: "stretch", minHeight: 72 }}
    >
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
        {bookendIcon}
      </Box>
      <Divider orientation="vertical" flexItem sx={{ mx: 0 }} />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          pl: 1.5,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignSelf: "stretch",
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

  const staticPaperSx = {
    p: 1.5,
    borderRadius: 2,
    overflow: "hidden",
    ...(inactive ? { opacity: 0.72, cursor: "default" } : {}),
  };

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
        sx={{
          p: 1.5,
          borderRadius: 2,
          overflow: "hidden",
          ...bookendCardInteractiveSx,
        }}
      >
        {inner}
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
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onAction(event);
          }
        }}
        aria-label={`${title} (opens dialog)`}
        sx={{ ...staticPaperSx, ...bookendCardInteractiveSx }}
      >
        {inner}
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={staticPaperSx}>
      {inner}
    </Paper>
  );
}

export function FirstLoginSupportStep() {
  const {
    DEFAULT_DISCORD_INVITE,
    DEFAULT_GITHUB_LINK,
    DEFAULT_EVE_FORUM_THREAD_LINK,
    DEFAULT_INGAME_SUPPORT_CHANNEL,
    DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER,
    ENABLE_FEEDBACK_ICON,
  } = GLOBAL_CONFIG;

  const githubHref =
    (DEFAULT_GITHUB_LINK || "").trim().replace(/\/$/, "") || undefined;

  return (
    <Stack spacing={2}>
      <FirstLoginSetupSection
        title="Need help later?"
        subtitle={`If you get stuck or have any questions about the application, here are the best places to get support.`}
      >
        <SupportBookendCard
          title="Discord"
          bookendIcon={<FaDiscord color="#7289DA" size={28} />}
          href={DEFAULT_DISCORD_INVITE || undefined}
          inactiveWithoutHref
        >
          <Typography variant="body2" color="text.secondary">
            {DEFAULT_DISCORD_INVITE
              ? "Usually the quickest way to get help: support tickets, release notes and community chat."
              : "A Discord invite is not set for this deployment yet."}
          </Typography>
        </SupportBookendCard>

        {ENABLE_FEEDBACK_ICON ? (
          <SupportBookendCard
            title="Feedback & screenshots"
            bookendIcon={
              <FeedbackOutlinedIcon color="primary" sx={{ fontSize: 28 }} />
            }
            onAction={() => openFeedbackDialog()}
          >
            <Typography variant="body2" color="text.secondary">
              Send bug reports, suggestions, and screenshots.
            </Typography>
          </SupportBookendCard>
        ) : null}

        <SupportBookendCard
          title="In-game contact"
          bookendIcon={
            <AlternateEmailIcon color="primary" sx={{ fontSize: 28 }} />
          }
        >
          <Typography variant="body2" color="text.secondary">
            Join in-game channel{" "}
            <strong>{DEFAULT_INGAME_SUPPORT_CHANNEL}</strong> or send in-game
            mail to <strong>{DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}</strong>.
          </Typography>
        </SupportBookendCard>

        <SupportBookendCard
          title="Wiki"
          bookendIcon={
            <MenuBookOutlinedIcon color="primary" sx={{ fontSize: 28 }} />
          }
          href={getWikiUrl()}
        >
          <Typography variant="body2" color="text.secondary">
            In-app docs for the planner, jobs, groups, and settings. Help icons
            on panels open the matching wiki page.
          </Typography>
        </SupportBookendCard>

        <SupportBookendCard
          title="EVE forum thread"
          bookendIcon={
            <ForumOutlinedIcon color="primary" sx={{ fontSize: 28 }} />
          }
          href={DEFAULT_EVE_FORUM_THREAD_LINK || undefined}
          inactiveWithoutHref
        >
          <Typography variant="body2" color="text.secondary">
            {DEFAULT_EVE_FORUM_THREAD_LINK
              ? "Community discussion on the official EVE forums."
              : "A forum thread link is not set for this deployment yet."}
          </Typography>
        </SupportBookendCard>

        {githubHref ? (
          <SupportBookendCard
            title="GitHub"
            bookendIcon={<GitHubIcon color="primary" sx={{ fontSize: 28 }} />}
            href={githubHref}
          >
            <Typography variant="body2" color="text.secondary">
              Produced and maintained by {DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}
              . Source, issues, and releases on GitHub.
            </Typography>
          </SupportBookendCard>
        ) : null}
      </FirstLoginSetupSection>
    </Stack>
  );
}
