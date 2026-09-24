import { Typography, Grid } from "@mui/material";
import { estimatedMaterialCost } from "../../../../../../../Functions/Groups/estimatedMaterialCost.js";
import { SMALL_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";
import useUsersStore from "../../../../../../../Zustand/usersStore";

export function ChildJobMaterials({
  jobDisplay,
  childJobObjects,
  marketLocation,
  orderType,
}) {
  // The child jobs built on this page but not saved, which are what a material
  // of the job on show may itself be built by.
  const temporaryChildJobs = useUsersStore(
    (store) => store.editSession.temporaryChildJobs,
  );
  const row = childJobObjects?.[jobDisplay];
  const materials = Object.values(row?.build?.materials ?? {});
  if (materials.length === 0) {
    return null;
  }

  return materials.map((material) => {
    const childJobs = row.build?.childJobs?.[material.typeID];
    const childJobIds = Array.isArray(childJobs) ? childJobs : [];

    const calculatedMaterialPrice = estimatedMaterialCost(
      material,
      childJobIds,
      temporaryChildJobs?.[material.typeID],
      marketLocation,
      orderType,
    );

    return (
      <Grid key={material.typeID} container size={12}>
        <Grid size={8}>
          <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
            {material.name}
          </Typography>
        </Grid>
        <Grid size={4}>
          <Typography sx={{ typography: SMALL_TEXT_FORMAT }} align="right">
            {formatNumberForLocale(calculatedMaterialPrice)}
          </Typography>
        </Grid>
      </Grid>
    );
  });
}
