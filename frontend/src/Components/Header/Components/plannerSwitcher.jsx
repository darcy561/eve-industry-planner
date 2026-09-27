import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
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
import { sendActivePlanner } from "../../../WebSocket/websocketClient.js";
import useUsersStore from "../../../Zustand/usersStore";
import { plannerScopedQueryRoots } from "../../../Hooks/React Query/Backend/plannerQueryScope.js";
import { flushPendingPlannerSettingsSaves } from "../../../Functions/Debounce/plannerSettingsPersistSchedule.js";
import { flushPendingJobDocumentsSave } from "../../../Functions/Debounce/jobDocumentsPersistSchedule.js";
import { flushPendingGroupSave } from "../../../Functions/Debounce/jobGroupsPersistSchedule.js";
import { loadPlannerDocuments } from "../../../Functions/DocumentLoad/loadPlannerDocuments.js";

/**
 * Switches which planner the app works in, naming the chosen planner before
 * switching so one with no document is given one.
 */
export function PlannerSwitcher() {
  const { data: planners, isLoading, isError } = usePlannersQuery();
  const queryClient = useQueryClient();
  const active =
    useUsersStore((state) =>
      state.activePlanner.actions.getActivePlannerOwner(),
    ) ?? "";
  const [busy, startSwitch] = useTransition();
  const [failure, setFailure] = useState("");
  const [unloaded, setUnloaded] = useState("");

  if (isLoading) {
    return <CircularProgress size={20} aria-label="Loading planners" />;
  }
  if (isError || !planners?.length) {
    return null;
  }

  async function loadPlanner(owner) {
    setFailure("");
    setUnloaded("");
    try {
      await loadPlannerDocuments(owner);
    } catch (err) {
      console.warn("[planner] loading the planner switched to failed", err);
      setFailure("Switched, but could not load this planner");
      setUnloaded(owner);
    }
  }

  function selectPlanner(owner) {
    startSwitch(async () => {
      setFailure("");
      setUnloaded("");
      const leaving = plannerScopedQueryRoots();
      try {
        await flushPendingJobDocumentsSave();
        await flushPendingGroupSave();
        const { pendingJobDocumentWrites, pendingJobGroupWrites } =
          useUsersStore.getState().jobData;
        if (
          Object.keys(pendingJobDocumentWrites ?? {}).length ||
          pendingJobGroupWrites?.length
        ) {
          setFailure("Unsaved changes could not be saved");
          return;
        }
        await ensurePlannerViaApi(owner);
        if (!sendActivePlanner(owner)) {
          setFailure("Not connected");
          return;
        }
        await flushPendingPlannerSettingsSaves();
        for (const root of leaving) {
          queryClient.removeQueries({ queryKey: root });
        }
      } catch (err) {
        setFailure(err?.message ?? "Could not switch planner");
        return;
      }
      await loadPlanner(owner);
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
        {unloaded ? (
          <Button
            size="small"
            variant="text"
            disabled={busy}
            onClick={() => startSwitch(() => loadPlanner(unloaded))}
          >
            Retry
          </Button>
        ) : null}
      </FormControl>
    </Box>
  );
}
