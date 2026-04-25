import { Icon, Tooltip, Typography, useTheme, Grid } from "@mui/material";

import { jobTypes } from "../../../../../../Context/defaultValues";
import DoneIcon from "@mui/icons-material/Done";
import LensIcon from "@mui/icons-material/Lens";
import MaterialPopoverIconButtons from "../../../../../../Styled Components/Popover/iconButtons";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { getJobTypeAccentColor } from "../../../../../../Functions/Helper/jobTypeDividerColor";
import { resolveMaterialChildJobStatus } from "../Material Prices/Helpers/materialChildJobs";

export function MaterialRow({ state, material, displayType }) {
  const theme = useTheme();
  const childJobsLocation = state.activeJob.build.childJobs[material.typeID] || [];
  const { hasLinked, hasTemp, hasPendingAdd } = resolveMaterialChildJobStatus({
    state,
    materialTypeID: material.typeID,
    childJobsLocation,
  });

  const quantityToUse =
    displayType === "active"
      ? state.activeJob.build.setup[state.activeJob.layout.setupToEdit]
          .materialCount[material.typeID].quantity
      : material.quantity;

  const jobTypeTextMap = {
    [jobTypes.baseMaterial]: "Base Material",
    [jobTypes.manufacturing]: "Manufacturing Job",
    [jobTypes.reaction]: "Reaction Job",
    [jobTypes.pi]: "Planetary Interaction",
  };

  function colorSelector() {
    const { jobType, typeID } = material;
    const { childJobs } = state.activeJob.build;

    if (jobType === jobTypes.manufacturing || jobType === jobTypes.reaction) {
      const hasLinkedChildren = childJobs[typeID].length > 0;
      const hasPendingChild = hasTemp || hasPendingAdd;
      if (!hasLinkedChildren && hasPendingChild) {
        return theme.palette.warning.main;
      }
    }

    return getJobTypeAccentColor(theme, jobType);
  }

  return (
    <Grid container size={12}>
      <Grid
        container
        size={{
          xs: 2,
          sm: 1,
        }}
        sx={{
          justifyContent: "center",
          alignItems: "center"
        }}>
        {!hasLinked && !hasTemp && !hasPendingAdd ? (
          <Tooltip
            title={jobTypeTextMap[material.jobType]}
            placement="left-start"
            arrow
          >
            <Icon
              sx={{
                color: colorSelector(),
              }}
            >
              <LensIcon fontSize="small" />
            </Icon>
          </Tooltip>
        ) : (
          <Tooltip
            title={
              hasTemp || hasPendingAdd
                ? `${jobTypeTextMap[material.jobType]} Pending`
                : `${jobTypeTextMap[material.jobType]} Linked`
            }
            placement="left-start"
            arrow
          >
            <Icon
              size="small"
              sx={{
                color: colorSelector(),
              }}
            >
              <DoneIcon xs={22} />
            </Icon>
          </Tooltip>
        )}
      </Grid>
      <Grid
        size={{
          xs: 7,
          sm: 7,
        }}
      >
        <MaterialPopoverIconButtons typeID={material.typeID}>
          <Typography sx={{ typography: { xs: "caption", sm: "body1" } }}>
            {material.name}
          </Typography>
        </MaterialPopoverIconButtons>
      </Grid>
      <Grid
        align="right"
        size={{
          xs: 3,
          sm: 4,
        }}
      >
        <Typography sx={{ typography: { xs: "caption", sm: "body1" } }}>
          {formatNumberForLocale(quantityToUse, { max: 0 })}
        </Typography>
      </Grid>
    </Grid>
  );
}
