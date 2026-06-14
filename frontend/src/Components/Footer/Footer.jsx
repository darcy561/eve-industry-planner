import { IconButton, Typography, Box, Tooltip, Stack } from "@mui/material";
import GitHubIcon from "@mui/icons-material/GitHub";
import { FaDiscord } from "react-icons/fa";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import GLOBAL_CONFIG from "../../global-config-app";
import useStaticDataBuildVersion from "../../Hooks/App/useStaticDataBuildVersion";

const {
  DEFAULT_DISCORD_INVITE,
  DEFAULT_GITHUB_LINK,
  DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER,
} = GLOBAL_CONFIG;

const SOCIAL_LINKS = [
  {
    name: "Discord",
    url: DEFAULT_DISCORD_INVITE,
    icon: FaDiscord,
    tooltip: "Join our Discord",
    color: "#7289DA",
    placement: "left",
  },
  {
    name: "GitHub",
    url: DEFAULT_GITHUB_LINK,
    icon: GitHubIcon,
    tooltip: "Visit our GitHub",
    placement: "right",
  },
];

export function Footer() {
  const sdeVersion = useStaticDataBuildVersion();

  return (
    <ContentPanel 
      componentName="Footer"
      paperSx={{ height: "auto" }}
    >
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
          width: "100%"
        }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 2,
          }}
        >
          {SOCIAL_LINKS.map((link) => {
            const IconComponent = link.icon;
            return (
              <Tooltip
                key={link.name}
                title={link.tooltip}
                arrow
                placement={link.placement}
              >
                <IconButton
                  component="a"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.name}
                  sx={link.color ? { color: link.color } : undefined}
                >
                  <IconComponent />
                </IconButton>
              </Tooltip>
            );
          })}
        </Box>

        <Stack spacing={0.5} sx={{
          alignItems: "center"
        }}>
          <Typography variant="caption" align="center">
            All EVE related materials are property of Fenris Creations.
          </Typography>
          <Typography variant="caption" align="center">
            Produced and maintained by {DEFAULT_INGAME_SUPPORT_MAIL_CHARACTER}
          </Typography>
          <Typography variant="caption" align="center">
            Version: {__APP_VERSION__}
          </Typography>
          {sdeVersion && (
            <Typography variant="caption" align="center">
              SDE Version: {sdeVersion}
            </Typography>
          )}
        </Stack>
      </Stack>
    </ContentPanel>
  );
}
