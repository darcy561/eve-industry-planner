import { Avatar, Badge, Paper, Tooltip, Typography, Grid } from "@mui/material";

import { STANDARD_TEXT_FORMAT } from "../../../../../Context/defaultValues";
import { blueGrey, grey } from "@mui/material/colors";
import { useApiJobCardSorter } from "../ClassicApiJobCardSorter";

function ClassiceAPIJobCard({ job, searchData }) {
  const { apiCardContent, jobCardText } = useApiJobCardSorter(job);

  const matchedItemName = searchData?.find(
    (i) => i.blueprintID === job.blueprint_type_id
  )?.name;

  if (jobCardText.length === 0) return null;

  return (
    <Tooltip title="Job Imported From The Eve ESI" arrow placement="bottom">
      <Grid
        size={{
          xs: 12,
          sm: 6,
          md: 4,
          lg: 3
        }}>
        <Paper
          elevation={3}
          square
          sx={{
            padding: 2,
            height: "100%",
            width: "100%",
          }}
        >
          <Grid container sx={{ height: "100%", flexDirection: "column" }} size={12}>
            <Grid container sx={{ height: "100%" }} size={12}>
              <Grid sx={{ display: "flex", justifyContent: "center" }} size={12}>
                <Typography
                  align="center"
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                >
                  {matchedItemName || "Loading..."}
                </Typography>
              </Grid>
              <Grid
                container
                sx={{
                  marginLeft: { xs: "10px", md: "0px" },
                  marginRight: { xs: "20px", md: "30px" },
                }}
                size={12}>
                <Grid
                  container
                  size={{
                    xs: 2,
                    sm: 3
                  }}
                  sx={{
                    justifyContent: "center",
                    alignItems: "center"
                  }}>
                  <Badge
                    overlap="circular"
                    anchorOrigin={{ vertical: "top", horizontal: "right" }}
                    badgeContent={
                      <Avatar
                        src={`https://images.evetech.net/characters/${job.installer_id}/portrait`}
                        variant="circular"
                        sx={{
                          height: { xs: "16px", sm: "24px", md: "32px" },
                          width: { xs: "16px", sm: "24px", md: "32px" },
                        }}
                      />
                    }
                  >
                    <Avatar
                      src={`https://images.evetech.net/types/${job.blueprint_type_id}/bp?size=64`}
                      alt={matchedItemName}
                      variant="square"
                      sx={{
                        xs: { height: "32", width: "32" },
                        sm: { height: "64", width: "64" },
                      }}
                    />
                  </Badge>
                </Grid>
                <Grid
                  container
                  sx={{ paddingLeft: { xs: "0px", sm: "5px" } }}
                  size={{
                    xs: 10,
                    sm: 9
                  }}>
                  {apiCardContent}
                </Grid>
              </Grid>
              <Grid container sx={{ marginTop: "10px", alignItems: "flex-end" }} size={12}>
                <Grid
                  sx={{
                    backgroundColor: job.is_corporation ? blueGrey[400] : grey[500],
                  }}
                  size={12}>
                  <Typography align="center" variant="body2" color="black">
                    <b>{jobCardText}</b>
                  </Typography>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </Paper>
      </Grid>
    </Tooltip>
  );
}

export default ClassiceAPIJobCard;
