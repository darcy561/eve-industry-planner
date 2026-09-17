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
  // The planner whose documents could not be loaded. The switch itself took, so
  // the control already shows this planner and choosing it again fires no change
  // — without somewhere to ask from, the reader is left on the previous
  // planner's jobs with no way back.
  const [unloaded, setUnloaded] = useState("");

  if (isLoading) {
    return <CircularProgress size={20} aria-label="Loading planners" />;
  }
  if (isError || !planners?.length) {
    return null;
  }

  // The job store holds one planner at a time, so until this returns the page is
  // showing the planner that was left.
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
        // Before the planner moves, not after: a queued job or group write is
        // sent for whichever planner the request names at the time it goes, so
        // an edit still inside its debounce would be written into the planner
        // being switched to.
        await flushPendingJobDocumentsSave();
        await flushPendingGroupSave();
        // A write that did not land leaves its ids queued. Switching now would
        // either send them to the planner being switched to or lose them, since
        // loading the new planner clears the queue.
        const { pendingJobDocumentWrites, pendingJobGroupWrites } =
          useUsersStore.getState().jobData;
        if (pendingJobDocumentWrites?.length || pendingJobGroupWrites?.length) {
          setFailure("Unsaved changes could not be saved");
          return;
        }
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
        return;
      }
      // Reported apart from the switch above, which either happened or did not:
      // past this line the planner has moved and only its documents are missing.
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
