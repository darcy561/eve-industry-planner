import { Container, Icon, Paper, Typography, Grid, Stack } from "@mui/material";

import { FaIndustry } from "react-icons/fa";
import { BsCalculatorFill } from "react-icons/bs";
import { RiMoneyDollarCircleLine } from "react-icons/ri";

const FEATURE_CARDS = [
  {
    icon: BsCalculatorFill,
    title: "Plan It",
  },
  {
    icon: FaIndustry,
    title: "Build It",
  },
  {
    icon: RiMoneyDollarCircleLine,
    title: "Sell It",
  },
];

export function IconBanner() {
  return (
    <Container
      disableGutters
      maxWidth="false"
      sx={{
        backgroundColor: "primary.main",
        padding: { xs: "40px 120px", sm: "60px 50px", md: "60px 120px" },
      }}
    >
      <Grid container spacing={5}>
        {FEATURE_CARDS.map((feature) => {
          const IconComponent = feature.icon;
          return (
            <Grid
              key={feature.title}
              size={{
                xs: 12,
                sm: 4,
              }}
            >
              <Paper
                elevation={10}
                sx={{
                  padding: { xs: "20px", sm: "50px" },
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <Stack spacing={{ xs: 0, sm: 1.25 }} alignItems="center">
                  <Icon fontSize="large">
                    <IconComponent />
                  </Icon>
                  <Typography variant="h6" align="center">
                    {feature.title}
                  </Typography>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Container>
  );
}
