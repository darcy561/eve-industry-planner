import { Grid } from "@mui/material";

import { useState } from "react";
import { jobTypes } from "../../Context/defaultValues";
import { ManufacturingOptionsUpcomingChanges } from "./manufacturingOptions";
import { ReactionOptionsUpcomingChanges } from "./reactionOptions";
import { UpcomingChangesSearch } from "./searchBar";
import { SisiItem } from "./sisiItem";
import { TranqItem } from "./tranqItem";
import { Navigate } from "@tanstack/react-router";
import useAppConfig from "../../Hooks/GeneralHooks/useAppConfig";

export default function UpcomingChanges() {
  const [itemLoad, updateItemLoad] = useState(false);
  const [tranqItem, updateTranqItem] = useState(null);
  const [sisiItem, updateSisiItem] = useState(null);
  const { enable_upcoming_changes_page: isEnabled = false } = useAppConfig();

  // Redirect if the feature is not enabled
  if (!isEnabled) {
    return <Navigate to="/" />;
  }

  return (
    <Grid
      container
      sx={{
        paddingLeft: { xs: "10px", sm: "20px" },
        paddingRight: { xs: "10px", sm: "20px" },
        marginTop: "5px",
      }}
      spacing={2}
    >
      <Grid item xs={12}>
        <UpcomingChangesSearch
          updateTranqItem={updateTranqItem}
          updateSisiItem={updateSisiItem}
          updateItemLoad={updateItemLoad}
        />
      </Grid>
      <Grid item xs={12}>
        {tranqItem !== null && sisiItem !== null ? (
          tranqItem.jobType === jobTypes.manufacturing &&
          sisiItem.jobType === jobTypes.manufacturing ? (
            <ManufacturingOptionsUpcomingChanges
              tranqItem={tranqItem}
              updateTranqItem={updateTranqItem}
              sisiItem={sisiItem}
              updateSisiItem={updateSisiItem}
              itemLoad={itemLoad}
            />
          ) : tranqItem.jobType === jobTypes.reaction &&
            sisiItem.jobType === jobTypes.reaction ? (
            <ReactionOptionsUpcomingChanges
              tranqItem={tranqItem}
              updateTranqItem={updateTranqItem}
              sisiItem={sisiItem}
              updateSisiItem={updateSisiItem}
              itemLoad={itemLoad}
            />
          ) : null
        ) : null}
      </Grid>
      <Grid container item xs={12} spacing={2} sx={{}}>
        <Grid item xs={12} md={6}>
          <TranqItem tranqItem={tranqItem} itemLoad={itemLoad} />
        </Grid>
        <Grid item xs={12} md={6}>
          <SisiItem
            sisiItem={sisiItem}
            itemLoad={itemLoad}
            tranqItem={tranqItem}
          />
        </Grid>
      </Grid>
    </Grid>
  );
}
