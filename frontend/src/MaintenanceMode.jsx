import {
  Box,
  Paper,
  Typography,
  Stack,
  Link,
  useTheme,
} from "@mui/material";
import GLOBAL_CONFIG from "./global-config-app";

const { DEFAULT_DISCORD_INVITE } = GLOBAL_CONFIG;

function MaintenanceMode() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 3 },
        boxSizing: "border-box",
        background: isDark
          ? `linear-gradient(165deg, ${theme.palette.grey[900]} 0%, ${theme.palette.background.default} 42%, ${theme.palette.primary.dark}24 100%)`
          : `linear-gradient(165deg, ${theme.palette.grey[100]} 0%, ${theme.palette.background.default} 48%, ${theme.palette.primary.light}40 100%)`,
      }}
    >
      <Paper
        elevation={isDark ? 12 : 8}
        sx={{
          maxWidth: 440,
          width: "100%",
          py: { xs: 4, sm: 5 },
          px: { xs: 3, sm: 4 },
          borderRadius: 2,
          textAlign: "center",
          border: 1,
          borderColor: "divider",
          backgroundColor: (t) =>
            t.palette.mode === "dark"
              ? "rgba(18, 18, 22, 0.85)"
              : "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Stack spacing={2.5} alignItems="center">
          <Box
            component="img"
            src="/android-chrome-192x192.png"
            alt="EVE Industry Planner"
            sx={{
              height: { xs: 72, sm: 88 },
              width: "auto",
              maxWidth: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
          <Typography
            variant="h5"
            component="h1"
            sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}
          >
            Under maintenance
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ lineHeight: 1.65, maxWidth: 360, mx: "auto" }}
          >
            EVE Industry Planner is temporarily unavailable. Thank you for your
            patience—please try again shortly.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>
            Status and announcements:{" "}
            <Link
              href={DEFAULT_DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              fontWeight={600}
            >
              Discord
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

export default MaintenanceMode;
