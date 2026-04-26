import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { LOGO_SRC } from "../../loadingBrand";

export function FirstLoginWelcomeBanner() {
  const theme = useTheme();

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
    >
      <Box
        component="img"
        src={LOGO_SRC}
        alt=""
        sx={{
          width: { xs: 56, sm: 72 },
          height: { xs: 56, sm: 72 },
          borderRadius: 2,
          flexShrink: 0,
          boxShadow: `0 6px 20px ${alpha(theme.palette.common.black, 0.18)}`,
          objectFit: "contain",
        }}
      />
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Typography variant="h4">Welcome to Eve Industry Planner</Typography>
        <Typography variant="body1" color="text.secondary">
          Before you get started lets configure the application to your liking.
        </Typography>
      </Stack>
    </Stack>
  );
}
