import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  CircularProgress,
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
} from "@mui/material";
import {
  plannerDisplayName,
  usePlannersQuery,
} from "../../../Hooks/React Query/planners.js";
import { ensurePlannerViaApi } from "../../../Functions/Endpoints/Private/planners.js";
import { sendActivePlanner } from "../../../Realtime/realtimeClient.js";
import useUsersStore from "../../../Zustand/usersStore";
import { plannerScopedQueryRoots } from "../../../Hooks/React Query/Backend/plannerQueryScope.js";
import { flushPendingPlannerSettingsSaves } from "../../../Functions/Debounce/plannerSettingsPersistSchedule.js";

/**
 * Switches which planner the app works in.
 *
 * Selecting a planner names it before switching to it: naming gives it a document
 * if it has none, which is what turns a corporation the account is merely in into
 * one somebody has opened.
 */
export function PlannerSwitcher() {
  const { data: planners, isLoading, isError } = usePlannersQuery();
  const queryClient = useQueryClient();
  const active =
    useUsersStore((state) =>
      state.activePlanner.actions.getActivePlannerOwner(),
    ) ?? "";
  // Switching is an action rather than a flag: React holds the pending state for
  // as long as the write is in flight, so the control stays disabled until the
  // planner it names is the one the connection has.
  const [busy, startSwitch] = useTransition();
  const [failure, setFailure] = useState("");

  if (isLoading) {
    return <CircularProgress size={20} aria-label="Loading planners" />;
  }
  if (isError || !planners?.length) {
    return null;
  }

  function selectPlanner(owner) {
    startSwitch(async () => {
      setFailure("");
      const leaving = plannerScopedQueryRoots();
      try {
        await ensurePlannerViaApi(owner);
        if (!sendActivePlanner(owner)) {
          setFailure("Not connected");
          return;
        }
        // Before the entries go: a settings edit still inside its debounce
        // window would otherwise be read back from the server on a switch
        // straight back, and the pending write would then save that over it.
        await flushPendingPlannerSettingsSaves();
        // Scoped keys carry the owner, so the entries under the planner being
        // left are of no further use to this session.
        for (const root of leaving) {
          queryClient.removeQueries({ queryKey: root });
        }
      } catch (err) {
        setFailure(err?.message ?? "Could not switch planner");
      }
    });
  }

  return (
    <Box sx={{ px: 2, py: 1 }}>
      <FormControl
        sx={{
          "& .MuiFormHelperText-root": {
            color: (theme) => theme.palette.secondary.main,
          },
        }}
        fullWidth
      >
        <Select
          id="planner-select"
          aria-describedby="planner-helper"
          variant="standard"
          size="small"
          value={active}
          disabled={busy}
          onChange={(event) => selectPlanner(event.target.value)}
        >
          {planners.map((planner) => (
            <MenuItem key={planner.owner} value={planner.owner}>
              {plannerDisplayName(planner)}
            </MenuItem>
          ))}
        </Select>
        <FormHelperText
          id="planner-helper"
          variant="standard"
          error={Boolean(failure)}
        >
          {failure || "Planner"}
        </FormHelperText>
      </FormControl>
    </Box>
  );
}
