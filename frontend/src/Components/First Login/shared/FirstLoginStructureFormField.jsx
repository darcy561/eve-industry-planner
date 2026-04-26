import { Box, Stack, Typography } from "@mui/material";

/**
 * Label + helper copy above a control in the first-login structure form.
 */
export function FirstLoginStructureFormField({ title, description, children }) {
  return (
    <Stack spacing={0.75}>
      <Typography
        variant="overline"
        sx={{
          color: "primary.main",
          letterSpacing: 0.06,
          lineHeight: 1.25,
          display: "block",
        }}
      >
        {title}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ lineHeight: 1.5 }}
      >
        {description}
      </Typography>
      <Box sx={{ pt: 0.25 }}>{children}</Box>
    </Stack>
  );
}
