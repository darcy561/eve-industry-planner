import { Card, Tooltip, Typography, Grid } from "@mui/material";

import { jobTypes } from "../../../Context/defaultValues";
import { blue } from "@mui/material/colors";
import useUsersStore from "../../../Zustand/usersStore";

const inUse = {
  backgroundColor: "#ffc107",
  color: "black",
};
const expiring = {
  backgroundColor: "#d32f2f",
  color: "black",
};

function styleBlueprintEntry(job, bpType, bpRuns) {
  if (bpType === "bpc") {
    if (job && bpRuns <= job.runs) {
      return expiring;
    } else if (job) {
      return inUse;
    } else {
      return null;
    }
  } else {
    if (job) {
      return inUse;
    } else {
      return null;
    }
  }
}

export function CompactBlueprintEntry({ blueprintGroup, bpData, esiJobs = [] }) {
  const blueprint = blueprintGroup[0];

  const blueprintType = blueprint.quantity === -2 ? "bpc" : "bp";

  const esiJob = esiJobs.find(
    (i) => i.blueprint_id === blueprint.item_id && i.status === "active"
  );

  const bpOwner = useUsersStore
    .getState()
    .users.actions.findUserByCharacterHash(blueprint.CharacterHash);

  const corpOwner = blueprint.is_corporation
    ? useUsersStore
        .getState()
        .users.actions.getCorporationObject(blueprint?.corporation_id)
    : null;

  return (
    <Grid
      container
      size={{
        xs: 12,
        md: 6
      }}>
      <Card
        elevation={2}
        square
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Grid container size={12}>
          <Grid container align="center" size={12}>
            <Tooltip
              title={
                blueprint.is_corporation
                  ? corpOwner?.corporationName || "unknown"
                  : bpOwner?.CharacterName || "unknown"
              }
              arrow
              placement="top"
            >
              <Grid container size={12}>
                {bpData?.jobType === jobTypes.manufacturing && (
                  <Grid container size={12}>
                    <Grid size={3}>
                      <Typography variant="caption">
                        M.E: {blueprint.material_efficiency}
                      </Typography>
                    </Grid>
                    <Grid size={3}>
                      <Typography variant="caption">
                        T.E: {blueprint.time_efficiency}
                      </Typography>
                    </Grid>
                    <Grid size={3}>
                      {blueprint.runs !== -1 && (
                        <Typography variant="caption">
                          Runs: {blueprint.runs}
                        </Typography>
                      )}
                    </Grid>
                    <Grid size={3}>
                      <Typography variant="caption">
                        Qty: {blueprintGroup.length}
                      </Typography>
                    </Grid>
                  </Grid>
                )}
                {bpData?.jobType === jobTypes.reaction && (
                  <Grid container size={12}>
                    <Grid size={12}>
                      <Typography variant="caption">
                        Qty: {blueprintGroup.length}
                      </Typography>
                    </Grid>
                  </Grid>
                )}
              </Grid>
            </Tooltip>
          </Grid>
          <Grid
            sx={{
              height: "2px",
              background: blueprint.quantity === -2 ? blue[300] : blue[700],
              ...styleBlueprintEntry(esiJob, blueprintType, blueprint.runs),
            }}
            size={12} />
        </Grid>
      </Card>
    </Grid>
  );
}
