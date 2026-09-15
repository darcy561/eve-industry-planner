import { useMemo } from "react";
import { Badge, Typography, Grid } from "@mui/material";

import useBlueprintIndex, {
  BLUEPRINT_SCOPE,
} from "../../../../../../Hooks/EveEsi/useBlueprintIndex";
import OwnerAvatar from "../../../../../../Styled Components/Avatar/OwnerAvatar";
import useGetAllIndustryJobs from "../../../../../../Hooks/EveEsi/useGetAllIndustryJobs";
import {
  TYPE_IMAGE,
  typeImageUrl,
} from "../../../../../../Functions/Shared/eveImage";

export function ReactionLayout_BlueprintOptions({ state }) {
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

  const blueprintOptions = useMemo(() => {
    const rows = blueprints.byTypeId.get(state.activeJob.blueprintTypeID) ?? [];
    if (rows.length === 0) return [];

    const activeJobBlueprintIDs = new Set(
      (industryJobs ?? [])
        .filter((job) => job.status === "active")
        .map((job) => job.blueprint_id),
    );

    // Grouped by whoever holds them. The rows carry their own owner, so nothing is stamped onto
    // them here — they belong to React Query's cache, not to this panel.
    const byOwner = new Map();
    for (const row of rows) {
      const held = byOwner.get(row.ownerId);
      if (held) {
        held.blueprints.push(row);
        continue;
      }

      byOwner.set(row.ownerId, {
        // The portrait is addressed by the character's own id rather than the hash a row is owned
        // by; the shared avatar does that lookup, so the group carries the owner as it stands.
        owner: { kind: row.ownerType, id: row.ownerId },
        blueprints: [row],
      });
    }

    return [...byOwner.values()]
      .map((group) => ({
        ...group,
        // A stack is one row carrying several, and each can hold its own job.
        totalBP: group.blueprints.reduce(
          (total, row) => total + Math.max(row.originalCount, 1),
          0,
        ),
        inUse: group.blueprints.filter((row) =>
          activeJobBlueprintIDs.has(row.itemId),
        ).length,
      }))
      .sort(
        (a, b) =>
          b.blueprints[0].me - a.blueprints[0].me ||
          b.blueprints[0].te - a.blueprints[0].te,
      );
  }, [blueprints, industryJobs, state.activeJob.blueprintTypeID]);

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
    <Grid
      container
      size={12}
      sx={{
        alignItems: "center",
      }}
    >
      {blueprintOptions.map((charBP) => {
        if (charBP.blueprints.length === 0) return null;

        return (
          <Grid
            key={charBP.owner.id}
            container
            size={{
              xs: 6,
              sm: 6,
              md: 12,
            }}
          >
            <Grid
              container
              align="center"
              size={{
                xs: 4,
                sm: 4,
                md: 5,
                lg: 3,
                xl: 3,
              }}
              sx={{
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Badge
                overlap="circular"
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                badgeContent={<OwnerAvatar owner={charBP.owner} size={24} />}
              >
                <picture>
                  <source
                    media="(max-width:700px)"
                    srcSet={typeImageUrl(
                      state.activeJob.blueprintTypeID,
                      TYPE_IMAGE.BLUEPRINT_COPY,
                      32,
                    )}
                  />
                  <img
                    src={typeImageUrl(
                      state.activeJob.blueprintTypeID,
                      TYPE_IMAGE.BLUEPRINT_COPY,
                      64,
                    )}
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
                xl: 9,
              }}
            >
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
