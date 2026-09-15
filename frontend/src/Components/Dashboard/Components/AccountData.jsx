import { Avatar, AvatarGroup, Typography, Grid } from "@mui/material";

import { useState } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import { useJobStatuses } from "../../../Hooks/useJobStatuses";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { characterImageUrl } from "../../../Functions/Shared/eveImage";

export function AccountData() {
  const { jobStatuses } = useJobStatuses();
  const characters = useUsersStore((state) => state.account.characters);
  const { jobArray } = useUsersStore((state) => state.jobData);
  const [dataCount] = useState({
    openMOrders: 0,
    histMOrders: 0,
    indJobs: 0,
    blueprints: 0,
    mTrans: 0,
    jEntries: 0,
  });

  return (
    <ContentPanel componentName="Account Data">
      <Grid container sx={{ flexDirection: "row" }}>
        <Grid container size={12}>
          <Grid align="center" size={12}>
            <AvatarGroup max={5}>
              {characters.map((user) => {
                return (
                  <Avatar
                    key={user.CharacterHash}
                    alt={`${user.CharacterName} Portrait Card`}
                    src={characterImageUrl(user.CharacterID, 90)}
                    sx={{
                      height: {
                        xs: "35px",
                        md: "45px",
                      },
                      width: {
                        xs: "35px",
                        md: "45px",
                      },
                      border: "none",
                    }}
                  />
                );
              })}
            </AvatarGroup>
          </Grid>
        </Grid>
        <Grid container sx={{ marginTop: "20px" }} size={12}>
          <Grid size={8}>
            <Typography sx={{ typography: { xs: "caption", sm: "subtitle1" } }}>
              Job Status Breakdown
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography sx={{ typography: { xs: "caption", sm: "subtitle1" } }}>
              Total Jobs: {jobArray.length}
            </Typography>
          </Grid>
        </Grid>
        <Grid container sx={{ marginTop: "5px" }} size={12}>
          {jobStatuses.map((step) => {
            const jobs = jobArray.filter((job) => job.jobStatus === step.id);
            return (
              <Grid key={step.id} container size={12}>
                <Grid size={10}>
                  <Typography
                    sx={{ typography: { xs: "caption", sm: "body2" } }}
                  >
                    {step.name}
                  </Typography>
                </Grid>
                <Grid size={2}>
                  <Typography
                    align="right"
                    sx={{ typography: { xs: "caption", sm: "body2" } }}
                  >
                    {jobs.length}
                  </Typography>
                </Grid>
              </Grid>
            );
          })}
        </Grid>
        <Grid container sx={{ marginTop: "20px" }} size={12}>
          <Grid size={6}>
            <Typography sx={{ typography: { xs: "caption", sm: "subtitle1" } }}>
              Imported API Data
            </Typography>
          </Grid>
        </Grid>
        <Grid container sx={{ marginTop: "5px" }} size={12}>
          <Grid size={8}>
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Open Market Orders
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography
              align="right"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              {formatNumberForLocale(dataCount.openMOrders, { max: 0 })}
            </Typography>
          </Grid>
          <Grid size={8}>
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Historic Market Orders
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography
              align="right"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              {formatNumberForLocale(dataCount.histMOrders, { max: 0 })}
            </Typography>
          </Grid>
          <Grid size={8}>
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Industry Jobs
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography
              align="right"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              {formatNumberForLocale(dataCount.indJobs, { max: 0 })}
            </Typography>
          </Grid>
          <Grid size={8}>
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Character Blueprints
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography
              align="right"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              {formatNumberForLocale(dataCount.blueprints, { max: 0 })}
            </Typography>
          </Grid>
          <Grid size={8}>
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Market Transactions
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography
              align="right"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              {formatNumberForLocale(dataCount.mTrans, { max: 0 })}
            </Typography>
          </Grid>
          <Grid size={8}>
            <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
              Journal Entries
            </Typography>
          </Grid>
          <Grid size={4}>
            <Typography
              align="right"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              {formatNumberForLocale(dataCount.jEntries, { max: 0 })}
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
