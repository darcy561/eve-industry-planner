import { useMemo } from "react";
import { Avatar, Badge, Typography, Grid } from "@mui/material";

import useUsersStore from "../../../../../../Zustand/usersStore";
import { useGetAllCharacterBlueprints } from "../../../../../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";
import { useGetAllCorporationBlueprints } from "../../../../../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import useGetAllIndustryJobs from "../../../../../../Hooks/EveEsi/useGetAllIndustryJobs";

export function ReactionLayout_BlueprintOptions({ state }) {
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

  const users = useUsersStore((state) => state.users.userArray);

  // Memoize the processed blueprint options
  const blueprintOptions = useMemo(() => {
    if (!characterBlueprints && !corporationBlueprints) {
      return [];
    }

    const userBlueprints = [];
    const corpBlueprints = [];

    // Process user blueprints
    users.forEach((user) => {
      const userData = characterBlueprints?.[user.CharacterHash]?.data ?? [];
      if (userData && userData.length > 0) {
        const temp = userData.filter(
          (i) => i.type_id === state.activeJob.blueprintTypeID
        );
        temp.forEach((i) => {
          i.owner_id = user.CharacterID;
        });
        userBlueprints.push({
          ownerID: user.CharacterID,
          blueprints: temp,
          totalBP: temp.reduce(
            (total, i) => (i.quantity > 0 ? total + i.quantity : total + 1),
            0
          ),
          inUse: (industryJobs || []).filter(
            (job) =>
              temp.some((i) => i.item_id === job.blueprint_id) &&
              job.status === "active"
          ).length,
          is_corporation: false,
        });
      }
    });

    // Process corporation blueprints
    if (corporationBlueprints) {
      Object.entries(corporationBlueprints).forEach(
        ([corporation_id, blueprintObjects]) => {
          const bluepringObjectsArray = Object.values(blueprintObjects);

          const matchedBlueprints = bluepringObjectsArray.filter(
            (i) => i.type_id === state.activeJob.blueprintTypeID
          );

          if (matchedBlueprints.length > 0) {
            corpBlueprints.push({
              corporation_id: corporation_id,
              blueprints: matchedBlueprints,
              totalBP: matchedBlueprints.reduce(
                (total, i) =>
                  i.quantity >= 0 ? total + i.quantity : total + 1,
                0
              ),
              inUse: (industryJobs || []).filter(
                (job) =>
                  matchedBlueprints.some(
                    (i) => i.item_id === job.blueprint_id
                  ) && job.status === "active"
              ).length,
              is_corporation: true,
            });
          }
        }
      );
    }

    // Combine and sort blueprints
    const combinedBlueprints = [...userBlueprints, ...corpBlueprints];
    const filteredBlueprints = combinedBlueprints.filter(
      (i) => i.blueprints.length > 0
    );

    filteredBlueprints.sort(
      (a, b) =>
        b.blueprints[0].material_efficiency -
          a.blueprints[0].material_efficiency ||
        b.blueprints[0].time_efficiency - a.blueprints[0].time_efficiency
    );

    return filteredBlueprints;
  }, [
    characterBlueprints,
    corporationBlueprints,
    industryJobs,
    users,
    state.activeJob.blueprintTypeID,
  ]);

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
            color: "error.main",
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
    <Grid container alignItems="center" size={12}>
      {blueprintOptions.map((charBP) => {
        if (charBP.blueprints.length === 0) return null;

        return (
          <Grid
            key={charBP.is_corporation ? charBP.corporation_id : charBP.ownerID}
            container
            size={{
              xs: 6,
              sm: 6,
              md: 12
            }}>
            <Grid
              container
              justifyContent="center"
              alignItems="center"
              align="center"
              size={{
                xs: 4,
                sm: 4,
                md: 5,
                lg: 3,
                xl: 3
              }}>
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                badgeContent={
                  <Avatar
                    src={
                      charBP.is_corporation
                        ? `https://images.evetech.net/corporations/${charBP.corporation_id}/logo`
                        : `https://images.evetech.net/characters/${charBP.ownerID}/portrait`
                    }
                    variant="circular"
                    sx={{
                      height: "24px",
                      width: "24px",
                    }}
                  />
                }
              >
                <picture>
                  <source
                    media="(max-width:700px)"
                    srcSet={`https://images.evetech.net/types/${state.activeJob.blueprintTypeID}/bpc?size=32`}
                  />
                  <img
                    src={`https://images.evetech.net/types/${state.activeJob.blueprintTypeID}/bpc?size=64`}
                    alt=""
                  />
                </picture>
              </Badge>
            </Grid>
            <Grid
              container
              size={{
                xs: 8,
                sm: 8,
                md: 7,
                lg: 9,
                xl: 9
              }}>
              <Grid size={12}>
                <Typography variant="caption">
                  Total: {charBP.totalBP}
                </Typography>
              </Grid>
              <Grid size={12}>
                <Typography variant="caption">
                  In Use: {charBP.inUse}
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        );
      })}
    </Grid>
  );
}
