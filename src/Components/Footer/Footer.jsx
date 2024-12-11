import { IconButton, Paper, Typography, Box, Tooltip } from "@mui/material";
import { GitHub } from "@mui/icons-material";
import { FaDiscord } from "react-icons/fa";

export function Footer() {
  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        padding: "20px",
      }}
      square
    >
      <Box textAlign="center">
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          gap="16px"
          sx={{ marginBottom: "16px" }}
        >
          <Tooltip title="Join our Discord" arrow placement="left">
            <IconButton
              component="a"
              href="https://discord.gg/KGSa8gh37z"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              sx={{ color: "#7289DA" }}
            >
              <FaDiscord size={24} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Visit our GitHub" arrow placement="right">
            <IconButton
              component="a"
              href="https://github.com/darcy561/Eve-Industry-Planner-React"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <GitHub />
            </IconButton>
          </Tooltip>
        </Box>

        <Typography
          display="block"
          variant="caption"
          sx={{ marginBottom: "5px" }}
        >
          All EVE related materials are property of CCP Games.
        </Typography>
        <Typography
          display="block"
          variant="caption"
          sx={{ marginBottom: "10px" }}
        >
          Produced and maintained by Oswold Saraki
        </Typography>

        <Typography
          display="block"
          variant="caption"
          sx={{ marginTop: "10px" }}
        >
          v{__APP_VERSION__}
        </Typography>
      </Box>
    </Paper>
  );
}
