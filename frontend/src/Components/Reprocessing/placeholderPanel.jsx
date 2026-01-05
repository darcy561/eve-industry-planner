import { Box, Typography, Divider, Grid } from "@mui/material";

import { LARGE_TEXT_FORMAT, STANDARD_TEXT_FORMAT } from "../../Context/defaultValues";

function PlaceholderPanel() {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        height: "100%",
        width: "100%",
        borderRadius: 2,
        pt: 4,
      }}
    >
      <Box
        sx={{
          padding: 4,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          maxWidth: 800,
          width: "100%",
        }}
      >
        <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center" color="primary">
          Welcome to the Reprocessing Calculator
        </Typography>
        
        <Divider />
        
        <Grid container spacing={2}>
          <Grid size={12}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="center">
              To get started:
            </Typography>
          </Grid>
          
          <Grid
            size={{
              xs: 12,
              md: 6
            }}>
            <Box sx={{ p: 2, height: "100%", border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} color="primary" gutterBottom>
                Converting to Minerals:
              </Typography>
              <Box sx={{ typography: STANDARD_TEXT_FORMAT }}>
                <Box component="span" sx={{ display: "block", mb: 1 }}>
                  1. Select "To Minerals" mode
                </Box>
                <Box component="span" sx={{ display: "block", mb: 1 }}>
                  2. Enter ore quantities in the format:
                  <Box component="span" sx={{ fontFamily: "monospace", display: "block", mt: 1 }}>
                    Veldspar 10000
                    <br />
                    Scordite 5000
                  </Box>
                </Box>
                <Box component="span" sx={{ display: "block", mb: 1 }}>
                  3. Configure your reprocessing setup (structure type and skills)
                </Box>
                <Box component="span" sx={{ display: "block" }}>
                  4. Click "Reprocess" to see results
                </Box>
              </Box>
            </Box>
          </Grid>
          
          <Grid
            size={{
              xs: 12,
              md: 6
            }}>
            <Box sx={{ p: 2, height: "100%", border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} color="primary" gutterBottom>
                Converting from Minerals:
              </Typography>
              <Box sx={{ typography: STANDARD_TEXT_FORMAT }}>
                <Box component="span" sx={{ display: "block", mb: 1 }}>
                  1. Select "From Minerals" mode
                </Box>
                <Box component="span" sx={{ display: "block", mb: 1 }}>
                  2. Enter mineral quantities in the format:
                  <Box component="span" sx={{ fontFamily: "monospace", display: "block", mt: 1 }}>
                    Tritanium 10000
                    <br />
                    Pyerite 5000
                  </Box>
                </Box>
                <Box component="span" sx={{ display: "block", mb: 1 }}>
                  3. Configure your reprocessing setup (structure type and skills)
                </Box>
                <Box component="span" sx={{ display: "block" }}>
                  4. Click "Reprocess" to see required ore
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
        
        <Divider />
        
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="center" color="textSecondary">
            Tip: Use the Advanced View toggle to see detailed breakdowns of reprocessing yields and values.
          </Typography>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="center" color="textSecondary" fontStyle="italic">
            Tip: You can copy and paste directly from your EVE Online inventory or cargo hold!
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default PlaceholderPanel;
