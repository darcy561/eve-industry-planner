import { useMemo } from "react";
import { Avatar, Badge, Tooltip, Typography, Grid } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";

import useUsersStore from "../../../../../../Zustand/usersStore";
import { red, yellow } from "@mui/material/colors";
import { useGetAllCharacterBlueprints } from "../../../../../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { useGetAllCorporationBlueprints } from "../../../../../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import useGetAllIndustryJobs from "../../../../../../Hooks/EveEsi/useGetAllIndustryJobs";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import recalculateJobFromSetup from "../../../../../../Functions/JobPlanner/recalculateJobFromSetup";
const inUse = yellow[800];
const expiring = red[600];

// Extracted component for individual blueprint item
const BlueprintItem = ({ print, esiJob, blueprintOwner, state, actions }) => {
  const queryClient = useQueryClient();

  const blueprintType = print.quantity === -2 ? "copy" : "original";
  const blueprintTypeUrl = print.quantity === -2 ? "bpc" : "bp";

  const activityColor = useMemo(
    () => activityStyleSelector(blueprintType, esiJob, print.runs),
    [blueprintType, esiJob, print.runs]
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
          const currentSetup =
            state.activeJob.build.setup[state.activeJob.layout.setupToEdit];
          currentSetup.updateMEValue(print.material_efficiency);
          currentSetup.updateTEValue(print.time_efficiency / 2);
          await recalculateJobFromSetup(
            currentSetup,
            state,
            actions,
            queryClient
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
              <Avatar
                src={
                  print.is_corporation
                    ? `https://images.evetech.net/corporations/${print.corporation_id}/logo`
                    : `https://images.evetech.net/characters/${blueprintOwner.CharacterID}/portrait`
                }
                variant="circular"
                sx={{
                  height: "18px",
                  width: "18px",
                }}
              />
            }
          >
            <picture>
              <source
                media="(max-width:700px)"
                srcSet={`https://images.evetech.net/types/${print.type_id}/${blueprintTypeUrl}?size=32`}
              />
              <img
                src={`https://images.evetech.net/types/${print.type_id}/${blueprintTypeUrl}?size=64`}
                alt=""
              />
            </picture>
          </Badge>
        </Grid>
        <Grid container align="center" size={12}>
          <Grid size={6}>
            <Typography variant="caption" align="center">
              ME:{print.material_efficiency}
            </Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" align="center">
              TE:{print.time_efficiency}
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

export function ManufacturingLayout_BlueprintPanel({ state, actions }) {
  const {
    data: characterBlueprints,
    isLoading: isLoadingCharacterBlueprints,
    error: characterBlueprintError,
  } = useGetAllCharacterBlueprints();
  const {
    data: corporationBlueprints,
    isLoading: isLoadingCorporationBlueprints,
    error: corporationBlueprintError,
  } = useGetAllCorporationBlueprints();
  const {
    data: industryJobs,
    isLoading: isLoadingIndustryJobs,
    error: industryJobsError,
  } = useGetAllIndustryJobs();

  // Memoize the filtered blueprints and job selection with better logic
  const { blueprintOptions, esiJobSelection } = useMemo(() => {
    if (!characterBlueprints && !corporationBlueprints) {
      return { blueprintOptions: [], esiJobSelection: [] };
    }

    // Combine and filter blueprints more efficiently
    const characterBps = characterBlueprints
      ? (() => {
          const data = Object.values(characterBlueprints)
            .map(({ data }) => data)
            .flat();
          return data.length > 0
            ? data.reduce((acc, bp) => {
                if (bp && bp.type_id && bp.item_id) {
                  acc.push({ ...bp, is_corporation: false });
                }
                return acc;
              }, [])
            : [];
        })()
      : [];

    const corporationBps = corporationBlueprints
      ? (() => {
          const data = Object.values(corporationBlueprints).flat();
          return data.length > 0
            ? data.reduce((acc, bp) => {
                if (bp && bp.type_id && bp.item_id) {
                  acc.push({ ...bp, is_corporation: true });
                }
                return acc;
              }, [])
            : [];
        })()
      : [];

    const allBlueprints = [...characterBps, ...corporationBps];

    // Filter by blueprint type ID
    const filteredBlueprints = allBlueprints.filter(
      (bp) => bp.type_id === state.activeJob.blueprintTypeID
    );

    // Deduplicate by item_id using Map for better performance
    const uniqueBlueprints = new Map();
    filteredBlueprints.forEach((bp) => {
      if (!uniqueBlueprints.has(bp.item_id)) {
        uniqueBlueprints.set(bp.item_id, bp);
      }
    });

    const blueprintArray = Array.from(uniqueBlueprints.values());

    // Sort blueprints more efficiently
    blueprintArray.sort((a, b) => {
      // Sort by quantity first (originals before copies)
      const quantityDiff = b.quantity - a.quantity;
      if (quantityDiff !== 0) return quantityDiff;

      // Then by material efficiency (higher first)
      const meDiff = b.material_efficiency - a.material_efficiency;
      if (meDiff !== 0) return meDiff;

      // Finally by time efficiency (higher first)
      return b.time_efficiency - a.time_efficiency;
    });
    // Filter industry jobs by blueprint type ID
    const selection = (industryJobs || []).filter(
      (job) => job.blueprint_type_id === state.activeJob.blueprintTypeID
    );

    return {
      blueprintOptions: blueprintArray,
      esiJobSelection: selection,
    };
  }, [
    characterBlueprints,
    corporationBlueprints,
    state.activeJob.blueprintTypeID,
    industryJobs,
  ]);

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
  if (
    isLoadingCharacterBlueprints ||
    isLoadingCorporationBlueprints ||
    isLoadingIndustryJobs
  ) {
    return (
      <Grid align="center" size={12}>
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          Loading Blueprints...
        </Typography>
      </Grid>
    );
  }

  // Error state
  if (
    characterBlueprintError ||
    corporationBlueprintError ||
    industryJobsError
  ) {
    const errorMessage =
      characterBlueprintError?.message ||
      corporationBlueprintError?.message ||
      industryJobsError?.message;
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
          const esiJob = jobLookupMap.get(print.item_id);
          const blueprintOwner = useUsersStore
            .getState()
            .account.actions.findCharacterByHash(print.CharacterHash);

          return (
            <BlueprintItem
              key={print.item_id}
              print={print}
              esiJob={esiJob}
              blueprintOwner={blueprintOwner}
              state={state}
              actions={actions}
            />
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
