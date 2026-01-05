import { Box, Button, Typography, Grid, Stack } from "@mui/material";

import { useNavigate } from "@tanstack/react-router";

export function HeaderBanner() {
  const navigate = useNavigate();
  return (
    <Grid
      container
      justifyContent="center"
      alignItems="center"
      sx={{
        position: "relative",
        paddingTop: "10%",
        paddingBottom: "10%",
      }}
      size={12}
    >
      <Stack
        spacing={{ xs: 1, sm: 2, md: 3, lg: 5 }}
        alignItems="center"
        sx={{
          position: "relative",
          zIndex: 1,
          width: "100%",
        }}
      >
        <Typography
          variant="h3"
          color="primary"
          align="center"
          sx={{
            marginTop: { xs: 1.25, sm: 0 },
            fontWeight: 700,
            fontStyle: "italic",
          }}
        >
          Making the spreadsheet so you dont have to!
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          size="large"
          onClick={() => navigate({ to: "/jobplanner" })}
        >
          Give it a try!
        </Button>
      </Stack>
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          backgroundImage: 'url("/images/loggedOutHome/purchasingStepImage.png")',
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          backgroundPosition: "center",
          height: "100%",
          width: "100%",
          opacity: 0.15,
        }}
      />
    </Grid>
  );
}
