import { Typography, Grid } from "@mui/material";
import { calculateMaterialCostFromChildJobs } from "../../../../../../../Functions/Groups/materialCostFromChildJobs.js";
import { SMALL_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";

export function ChildJobMaterials_ChildJobPopoverFrame({
  state,
  jobDisplay,
  childJobObjects,
  marketSelect,
  listingSelect,
}) {
  const row = childJobObjects?.[jobDisplay];
  const materials = row?.build?.materials;
  if (!Array.isArray(materials)) {
    return null;
  }

  return materials.map((material) => {
    const childJobs = row.build?.childJobs?.[material.typeID];
    const childJobIds = Array.isArray(childJobs) ? childJobs : [];

    const calculatedMaterialPrice = calculateMaterialCostFromChildJobs(
      material,
      childJobIds,
      state.temporaryChildJobs?.[material.typeID],
      {},
      marketSelect,
      listingSelect
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
