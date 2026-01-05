import { Avatar, AvatarGroup, Typography, Grid } from "@mui/material";

import { useEffect, useState } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";

export function AccountData() {
  const { userArray, jobStatus } = useUsersStore((state) => state.users);
  const { userJobSnapshot } = useUsersStore((state) => state.jobData);
  const [dataCount, updateDataCount] = useState({
    openMOrders: 0,
    histMOrders: 0,
    indJobs: 0,
    blueprints: 0,
    mTrans: 0,
    jEntries: 0,
  });

  // useEffect(() => {
  //   let newOpenMOrders = 0;
  //   let newHistMOrders = 0;
  //   let newIndJobs = 0;
  //   let newBlueprints = 0;
  //   let newMTrans = 0;
  //   let newJEntries = 0;

  //   esiIndJobs.forEach((entry) => {
  //     newIndJobs += entry.data.length;
  //   });
  //   for (const [, value] of corpEsiIndJobs) {
  //     newIndJobs += Object.keys(value).length;
  //   }
  //   esiOrders.forEach((entry) => {
  //     newOpenMOrders += entry.data.length;
  //   });
  //   esiHistOrders.forEach((entry) => {
  //     newHistMOrders += entry.data.length;
  //   });
  //   esiTransactions.forEach((entry) => {
  //     newMTrans += entry.data.length;
  //   });
  //   esiJournal.forEach((entry) => {
  //     newJEntries += entry.data.length;
  //   });
  //   esiBlueprints.forEach((entry) => {
  //     newBlueprints += entry.data.length;
  //   });

  //   updateDataCount({
  //     openMOrders: newOpenMOrders,
  //     histMOrders: newHistMOrders,
  //     indJobs: newIndJobs,
  //     blueprints: newBlueprints,
  //     mTrans: newMTrans,
  //     jEntries: newJEntries,
  //   });
  // }, [
  //   esiIndJobs,
  //   corpEsiIndJobs,
  //   esiOrders,
  //   esiHistOrders,
  //   esiTransactions,
  //   esiJournal,
  //   esiBlueprints,
  // ]);

  return (
    <ContentPanel componentName="Account Data">
      <Grid container direction="row">
        <Grid container size={12}>
          <Grid align="center" size={12}>
            <AvatarGroup max={5}>
              {userArray.map((user) => {
                return (
                  <Avatar
                    key={user.CharacterHash}
                    alt={`${user.CharacterName} Portrait Card`}
                    src={`https://images.evetech.net/characters/${user.CharacterID}/portrait`}
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
              Total Jobs: {userJobSnapshot.length}
            </Typography>
          </Grid>
        </Grid>
        <Grid container sx={{ marginTop: "5px" }} size={12}>
          {jobStatus.map((step) => {
            const jobs = userJobSnapshot.filter(
              (job) => job.jobStatus === step.id
            );
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
              {formatNumberForLocale(dataCount.openMOrders, { max: 0 })}
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
