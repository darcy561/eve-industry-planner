import { Typography, Grid } from "@mui/material";
import { calculateMaterialCostFromChildJobs } from "../../../../../../../Functions/Groups/materialCostFromChildJobs.js";
import { SMALL_TEXT_FORMAT } from "../../../../../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../../../../../Functions/Helper/numberParser";

export function ChildJobMaterials_ChildJobPopoverFrame({
  state,
  jobDisplay,
  childJobObjects,
  tempPrices,
  marketSelect,
  listingSelect,
}) {
  return childJobObjects[jobDisplay].build.materials.map((material) => {
    const childJobs =
      childJobObjects[jobDisplay].build.childJobs[material.typeID];

    const calculatedMaterialPrice = calculateMaterialCostFromChildJobs(
      material,
      childJobs,
      state.temporaryChildJobs[material.typeID],
      tempPrices,
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
