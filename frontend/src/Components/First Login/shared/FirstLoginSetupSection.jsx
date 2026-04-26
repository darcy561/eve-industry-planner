import { Box, Paper, Stack, Typography } from "@mui/material";
import { appShellSetupSectionPaperSx } from "../../../Context/appShell";

/**
 * Onboarding section card (app-shell section surface).
 */
export function FirstLoginSetupSection({ title, subtitle, children }) {
  return (
    <Paper variant="outlined" sx={appShellSetupSectionPaperSx}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h6" color="primary">
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {children}
      </Stack>
    </Paper>
  );
}
