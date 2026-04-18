import { CircularProgress, Box, Typography, Slide, Paper, Fade, Grid } from "@mui/material";

import { useState, useEffect } from "react";

import GLOBAL_CONFIG from "../../../global-config-app";
import { STANDARD_TEXT_FORMAT } from "../../../Context/defaultValues";
import { subscribeToEvent } from "../../../utils/EventSystem";

export function MassBuildFeedback() {
  const { PRIMARY_THEME } = GLOBAL_CONFIG;
  const [feedbackData, setFeedbackData] = useState({
    open: false,
    currentJob: 0,
    totalJob: 0,
    totalPrice: 0,
  });

  useEffect(() => {
    const unsubscribe = subscribeToEvent("massBuildFeedback", (data) => {
      setFeedbackData(data);
    });
    return () => unsubscribe();
  }, []);

  if (!feedbackData.open) return null;

  return (
    <Slide direction="left" in={feedbackData.open} unmountOnExit>
      <Paper
        elevation={5}
        sx={{
          position: "fixed",
          top: { xs: "5%", sm: "10%" },
          right: "0",
          width: { xs: "100%", sm: "60%", md: "45%", lg: "35%", xl: "25%" },
          borderTopLeftRadius: { xs: "0px", sm: "10px" },
          borderBottomLeftRadius: { xs: "0px", sm: "10px" },
          padding: "24px",
          zIndex: (theme) => theme.zIndex.drawer + 1,
          backgroundColor: (theme) =>
            theme.palette.mode === PRIMARY_THEME 
              ? theme.palette.secondary.dark 
              : theme.palette.background.paper,
          borderStyle: "solid",
          borderRightStyle: { xs: "solid", sm: "none" },
          borderWidth: "1px",
          borderColor: (theme) =>
            theme.palette.mode === PRIMARY_THEME
              ? theme.palette.secondary.highlight
              : theme.palette.secondary.main,
          '& .MuiTypography-root': {
            color: (theme) => 
              theme.palette.mode === PRIMARY_THEME
                ? theme.palette.secondary.light
                : theme.palette.text.primary,
          },
          '& .MuiCircularProgress-root': {
            color: (theme) => 
              theme.palette.mode === PRIMARY_THEME
                ? theme.palette.primary.light
                : theme.palette.primary.main,
          },
          backdropFilter: 'blur(8px)',
          boxShadow: (theme) => 
            theme.palette.mode === PRIMARY_THEME
              ? '0 4px 20px rgba(0, 0, 0, 0.3)'
              : '0 4px 20px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Grid container spacing={3}>
          <Grid container align="center" spacing={2} size={12} sx={{
            justifyContent: "center"
          }}>
            <Grid>
              <Fade in={true} timeout={500}>
                <CircularProgress 
                  xs={28} 
                  thickness={4}
                  sx={{ 
                    marginRight: "20px",
                    animation: 'pulse 2s infinite ease-in-out',
                    '@keyframes pulse': {
                      '0%': { transform: 'scale(1)' },
                      '50%': { transform: 'scale(1.05)' },
                      '100%': { transform: 'scale(1)' }
                    }
                  }} 
                />
              </Fade>
            </Grid>
            <Grid>
              <Fade in={true} timeout={800}>
                {feedbackData.currentJob !== feedbackData.totalJob ? (
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      typography: STANDARD_TEXT_FORMAT,
                      fontWeight: 500,
                      letterSpacing: '0.5px'
                    }}
                  >
                    Building Job {feedbackData.currentJob} of {feedbackData.totalJob}
                  </Typography>
                ) : (
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      typography: STANDARD_TEXT_FORMAT,
                      fontWeight: 500,
                      letterSpacing: '0.5px'
                    }}
                  >
                    Calculating Costs for {feedbackData.totalPrice} Materials
                  </Typography>
                )}
              </Fade>
            </Grid>
          </Grid>
        </Grid>
      </Paper>
    </Slide>
  );
}
