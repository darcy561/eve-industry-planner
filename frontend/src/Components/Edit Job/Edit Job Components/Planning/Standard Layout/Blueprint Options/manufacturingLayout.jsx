import { useMemo } from "react";
import { Badge, Tooltip, Typography, Grid } from "@mui/material";
import { red, yellow } from "@mui/material/colors";
import useBlueprintIndex, {
  BLUEPRINT_SCOPE,
} from "../../../../../../Hooks/EveEsi/useBlueprintIndex";
import { blueprintOwner } from "../../../../../../Functions/Blueprints/blueprintHolderLabel";
import OwnerAvatar from "../../../../../../Styled Components/Avatar/OwnerAvatar";
import useGetAllIndustryJobs from "../../../../../../Hooks/EveEsi/useGetAllIndustryJobs";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import applySetupChange from "../../../../../../Functions/Job/setups/applySetupChange";
import { typeImageUrl } from "../../../../../../Functions/Shared/eveImage";
import {
  jobDraftNow,
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import { selectedSetup } from "../../../../Edit Job Hooks/jobSelectors";
const inUse = yellow[800];
const expiring = red[600];

// Extracted component for individual blueprint item
/**
 * One blueprint the job could be built from. Exported so a test can count its
 * renders: the list holds one per blueprint the reader owns, so what a tile
 * subscribes to is multiplied by however many they have.
 */
export const BlueprintItem = ({ print, esiJob }) => {
  const actions = useJobActions();
  const blueprintType = print.isCopy ? "copy" : "original";
  const blueprintTypeUrl = print.isCopy ? "bpc" : "bp";

  const activityColor = useMemo(
    () => activityStyleSelector(blueprintType, esiJob, print.runs),
    [blueprintType, esiJob, print.runs],
  );

  const runsDisplay = useMemo(() => {
    if (blueprintType !== "copy") return null;

    if (esiJob) {
      return (
        <Tooltip
          title="Runs available after current job completes. (Runs before starting current job)"
          arrow
          placement="top"
        >
          <Typography variant="caption">
            Runs: {print.runs - esiJob.runs} (
            {formatNumberForLocale(print.runs, { max: 0 })})
          </Typography>
        </Tooltip>
      );
    }

    return <Typography variant="caption">Runs: {print.runs}</Typography>;
  }, [blueprintType, esiJob, print.runs]);

  return (
    <Tooltip title="Click To Use Blueprint" arrow placement="top">
      <Grid
        container
        onClick={async () => {
          await applySetupChange(
            // Read when the tile is pressed rather than subscribed to: a tile
            // draws none of the setup, and there is one of these per blueprint.
            selectedSetup(jobDraftNow()),
            "use a blueprint you own",
            (setup) => {
              setup.updateMEValue(print.me);
              setup.updateTEValue(print.te / 2);
            },
            actions,
          );
        }}
        size={{
          xs: 6,
          md: 4,
        }}
      >
        <Grid align="center" size={12}>
          <Badge
            overlap="circular"
            anchorOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
            badgeContent={
              <OwnerAvatar owner={blueprintOwner(print)} size={18} />
            }
          >
            <picture>
              <source
                media="(max-width:700px)"
                srcSet={typeImageUrl(print.typeId, blueprintTypeUrl, 32)}
              />
              <img
                src={typeImageUrl(print.typeId, blueprintTypeUrl, 64)}
                alt=""
              />
            </picture>
          </Badge>
        </Grid>
        <Grid container align="center" size={12}>
          <Grid size={6}>
            <Typography variant="caption" align="center">
              ME:{print.me}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" align="center">
              TE:{print.te}
            </Typography>
          </Grid>
          {blueprintType === "copy" && <Grid size={12}>{runsDisplay}</Grid>}
          <Grid
            sx={{
              height: "3px",
              backgroundColor: activityColor,
            }}
            size={12}
          />
        </Grid>
      </Grid>
    </Tooltip>
  );
};

// Extracted component for legend
const BlueprintLegend = () => (
  <Grid container sx={{ marginTop: "20px" }} size={12}>
    <Grid size={6}>
      <Typography
        align="center"
        sx={{
          typography: { xs: "caption", sm: "body2" },
          backgroundColor: inUse,
          color: "black",
        }}
      >
        Blueprint In Use
      </Typography>
    </Grid>
    <Grid size={6}>
      <Typography
        align="center"
        sx={{
          typography: { xs: "caption", sm: "body2" },
          backgroundColor: expiring,
          color: "black",
        }}
      >
        Blueprint Finishing
      </Typography>
    </Grid>
  </Grid>
);

export function ManufacturingLayout_BlueprintPanel() {
  const blueprintTypeID = useJobDraft((job) => job.blueprintTypeID);
  const {
    data: blueprints,
    isLoading: isLoadingBlueprints,
    error: blueprintError,
  } = useBlueprintIndex({ scope: BLUEPRINT_SCOPE.ALL });
  const {
    data: industryJobs,
    isLoading: isLoadingIndustryJobs,
    error: industryJobsError,
  } = useGetAllIndustryJobs();

  // Memoize the filtered blueprints and job selection with better logic
  const { blueprintOptions, esiJobSelection } = useMemo(() => {
    const blueprintOptions = blueprints.byTypeId.get(blueprintTypeID) ?? [];

    // Ordered and deduplicated when the collection was built — originals before copies, then the
    // most researched — so there is nothing to sort or collapse here.
    return {
      blueprintOptions,
      esiJobSelection: (industryJobs ?? []).filter(
        (job) => job.blueprint_type_id === blueprintTypeID,
      ),
    };
  }, [blueprints, blueprintTypeID, industryJobs]);

  // Memoize the job lookup map for better performance
  const jobLookupMap = useMemo(() => {
    const map = new Map();
    esiJobSelection.forEach((job) => {
      if (job.status === "active") {
        map.set(job.blueprint_id, job);
      }
    });
    return map;
  }, [esiJobSelection]);

  // Loading state
  if (isLoadingBlueprints || isLoadingIndustryJobs) {
    return (
      <Grid align="center" size={12}>
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          Loading Blueprints...
        </Typography>
      </Grid>
    );
  }

  // Error state
  if (blueprintError || industryJobsError) {
    const errorMessage = blueprintError?.message || industryJobsError?.message;
    return (
      <Grid align="center" size={12}>
        <Typography
          sx={{
            typography: { xs: "caption", sm: "body2" },
            color: red[600],
          }}
        >
          Error loading blueprints: {errorMessage}
        </Typography>
      </Grid>
    );
  }

  // Empty state
  if (blueprintOptions.length === 0) {
    return (
      <Grid align="center" size={12}>
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          No Blueprints Found
        </Typography>
      </Grid>
    );
  }

  return (
    <Grid container size={12}>
      <Grid
        container
        spacing={2}
        sx={{
          maxHeight: { xs: "370px", sm: "220px", md: "370px" },
          overflowY: "auto",
          overflowX: "hidden",
          paddingRight: "10px",
        }}
        size={12}
      >
        {blueprintOptions.map((print) => {
          const esiJob = jobLookupMap.get(print.itemId);

          return (
            <BlueprintItem key={print.itemId} print={print} esiJob={esiJob} />
          );
        })}
      </Grid>
      <BlueprintLegend />
    </Grid>
  );
}

function activityStyleSelector(blueprintType, esiJob, blueprintRuns) {
  if (blueprintType === "original") {
    return esiJob ? inUse : null;
  }

  if (blueprintType === "copy") {
    if (esiJob && blueprintRuns <= esiJob.runs) {
      return expiring;
    }
    if (esiJob) {
      return inUse;
    }
  }

  return null;
}
