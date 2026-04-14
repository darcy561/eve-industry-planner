import { Paper, Typography, Grid } from "@mui/material";

import { useActiveSlotTotals } from "../../../Hooks/GeneralHooks/useActiveSlotTotals";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../Context/defaultValues";
import useUsersStore from "../../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";

export function ActiveCharacterSlots() {
  const {
    isLoading,
    isError,
    error,
    calculateActiveSlotsMultiple,
  } = useActiveSlotTotals();
  const queryClient = useQueryClient();

  const activeCharSlots = calculateActiveSlotsMultiple(queryClient);

  return (
    <ContentPanel title="Active Slots" componentName="Active Slots" isLoading={isLoading} isError={isError} error={error}>
      <Grid
        container
        sx={{
          overflowY: "auto",
          maxHeight: { xs: "320px", sm: "220px", md: "320px" },
        }}
        size={12}>
        {activeCharSlots.map((char) => {
          const charName = useUsersStore
            .getState()
            .account.actions.findCharacterByHash(
              char.characterHash
            )?.CharacterName;

          if (!charName) return null;
          return (
            <Grid
              key={char.characterHash}
              container
              sx={{ marginBottom: { xs: "5px" } }}
              size={12}>
              <Grid size={12}>
                <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                  {charName}
                </Typography>
              </Grid>
              <Grid size={4}>
                <Typography
                  align="center"
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                >
                  Manufacturing {char.activeManufacturingJobs}/
                  {char.manufacturingSlots}
                </Typography>
              </Grid>
              <Grid size={4}>
                <Typography
                  align="center"
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                >
                  Reaction {char.activeReactionSlots}/{char.reactionSlots}
                </Typography>
              </Grid>
              <Grid size={4}>
                <Typography
                  align="center"
                  sx={{ typography: STANDARD_TEXT_FORMAT }}
                >
                  Science {char.activeScienceSlots}/{char.scienceSlots}
                </Typography>
              </Grid>
            </Grid>
          );
        })}
      </Grid>
    </ContentPanel>
  );
}
