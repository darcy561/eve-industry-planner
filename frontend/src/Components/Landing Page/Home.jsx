import { Container, Typography, Box, Grid, Stack } from "@mui/material";
import { HeaderBanner } from "./Components/headerBanner";
import { IconBanner } from "./Components/IconBanner";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";

export function Home() {
  return (
    <DefaultPageLayout>
      <Grid container>
        <Grid size={12}>
          <HeaderBanner />
        </Grid>
        <Grid container size={12}>
          <IconBanner />
        </Grid>
        <Grid
          container
          sx={{ margin: { xs: "15px 10px", sm: "15px 5%" } }}
          size={12}
        >
          <Grid
            size={{
              xs: 12,
              lg: 4,
            }}
          >
            <Stack spacing={2} sx={{ paddingTop: { lg: "5%" } }}>
              <Typography variant="body1" align="left">
                Eve Industry Planner is a new way to plan and manage your
                industry jobs quickly, so that you can spend more time in game
                doing the things that you enjoy!
              </Typography>
              <Typography variant="body1" align="left">
                As many of the longer standing members of the Eve Online
                community will know, having a good spreadsheet to manage your
                industry jobs is important and extremely useful. Being able to
                know exactly how much something has cost you to build is vital
                when it comes to selling your items for the right price, in the
                right location. Get it wrong and you could lose a lot of ISK!
              </Typography>
              <Typography variant="body1" align="left">
                For the newer players or the more experienced players of the
                game who are wanting to get involved with the industry
                lifestyle. Eve Industry Planner is here to help you manage your
                jobs easily, whether you are in front of your PC, on the bus or
                just sat at work. Using the data provided by the Eve ESI you can
                keep up to date with your industry jobs and sell orders.
              </Typography>
            </Stack>
          </Grid>
          <Grid
            container
            justifyContent="center"
            alignItems="center"
            sx={{ paddingLeft: { lg: "20px" } }}
            size={{
              xs: 12,
              lg: 8,
            }}
          >
            <Box
              component="img"
              src="/images/loggedOutHome/planningStepImage.png"
              alt="EVE Industry Planner job planning interface"
              sx={{ width: "100%", height: "auto" }}
            />
          </Grid>
        </Grid>
      </Grid>
    </DefaultPageLayout>
  );
}
