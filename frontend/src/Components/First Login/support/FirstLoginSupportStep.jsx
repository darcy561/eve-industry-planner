import { Stack, Typography } from "@mui/material";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import { FaDiscord } from "react-icons/fa";
import GLOBAL_CONFIG from "../../../global-config-app";
import { openFeedbackDialogue } from "../../../Events/feedbackDialogueEvents";
import { SectionPanel } from "../../../Styled Components/Paper/SectionPanel";
import ActionCard from "../../../Styled Components/Paper/ActionCard";

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
      <SectionPanel
        title="Need help later?"
        subtitle={`If you get stuck or have any questions about the application, here are the best places to get support.`}
      >
        <ActionCard
          title="Discord"
          icon={<FaDiscord color="#7289DA" size={28} />}
          href={DEFAULT_DISCORD_INVITE || undefined}
          muted
        >
          <Typography variant="body2" color="text.secondary">
            {DEFAULT_DISCORD_INVITE
              ? "Usually the quickest way to get help: support tickets, release notes and community chat."
              : "A Discord invite is not set for this deployment yet."}
          </Typography>
        </ActionCard>

        {ENABLE_FEEDBACK_ICON ? (
          <ActionCard
            title="Feedback & screenshots"
            icon={
              <FeedbackOutlinedIcon color="primary" sx={{ fontSize: 28 }} />
            }
            onAction={() => openFeedbackDialogue()}
          >
            <Typography variant="body2" color="text.secondary">
              Send bug reports, suggestions, and screenshots.
            </Typography>
          </ActionCard>
        ) : null}

        <ActionCard
          title="In-game contact"
          icon={<AlternateEmailIcon color="primary" sx={{ fontSize: 28 }} />}
        >
          <Typography variant="body2" color="text.secondary">
            Join in-game channel{" "}
            <strong>{DEFAULT_INGAME_SUPPORT_CHANNEL}</strong> or send in-game
            mail to <strong>{DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}</strong>.
          </Typography>
        </ActionCard>

        <ActionCard
          title="Wiki (coming soon)"
          icon={<MenuBookOutlinedIcon color="primary" sx={{ fontSize: 28 }} />}
        >
          <Typography variant="body2" color="text.secondary">
            A full wiki for this site is under development and will be linked
            here and throughout the app once ready.
          </Typography>
        </ActionCard>

        <ActionCard
          title="EVE forum thread"
          icon={<ForumOutlinedIcon color="primary" sx={{ fontSize: 28 }} />}
          href={DEFAULT_EVE_FORUM_THREAD_LINK || undefined}
          muted
        >
          <Typography variant="body2" color="text.secondary">
            {DEFAULT_EVE_FORUM_THREAD_LINK
              ? "Community discussion on the official EVE forums."
              : "A forum thread link is not set for this deployment yet."}
          </Typography>
        </ActionCard>

        {githubHref ? (
          <ActionCard
            title="GitHub"
            icon={<GitHubIcon color="primary" sx={{ fontSize: 28 }} />}
            href={githubHref}
          >
            <Typography variant="body2" color="text.secondary">
              Produced and maintained by {DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}
              . Source, issues, and releases on GitHub.
            </Typography>
          </ActionCard>
        ) : null}
      </SectionPanel>
    </Stack>
  );
}
