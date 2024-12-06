import { useContext } from "react";
import { Card, Grid, Tooltip, Typography } from "@mui/material";
import { jobTypes } from "../../../Context/defaultValues";
import { UsersContext } from "../../../Context/AuthContext";
import { CorpEsiDataContext } from "../../../Context/EveDataContext";
import { blue } from "@mui/material/colors";

export function CompactBlueprintEntry({ blueprintGroup, bpData }) {
  const { users } = useContext(UsersContext);
  const { corpEsiData } = useContext(CorpEsiDataContext);

  const blueprint = blueprintGroup[0];

  const bpOwner = users.find(
    (u) => u.CharacterHash === blueprint.CharacterHash
  );
  const corpOwner = corpEsiData.get(blueprint?.corporation_id);

  return (
    <Grid container item xs={12} md={6}>
      <Card
        elevation={2}
        square
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Grid container item xs={12}>
          <Grid container item xs={12} align="center">
            <Tooltip
              title={
                blueprint.isCorp
                  ? corpOwner?.name || "unknown"
                  : bpOwner?.CharacterName || "unknown"
              }
              arrow
              placement="top"
            >
              <Grid container item xs={12}>
                {bpData.jobType === jobTypes.manufacturing && (
                  <Grid container item xs={12}>
                    <Grid item xs={3}>
                      <Typography variant="caption">
                        M.E: {blueprint.material_efficiency}
                      </Typography>
                    </Grid>
                    <Grid item xs={3}>
                      <Typography variant="caption">
                        T.E: {blueprint.time_efficiency}
                      </Typography>
                    </Grid>
                    <Grid item xs={3}>
                      {blueprint.runs !== -1 && (
                        <Typography variant="caption">
                          Runs: {blueprint.runs}
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={3}>
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
            item
            xs={12}
            sx={{
              height: "2px",
              background: blueprint.quantity === -2 ? blue[300] : blue[700],
            }}
          />
        </Grid>
      </Card>
    </Grid>
  );
}
