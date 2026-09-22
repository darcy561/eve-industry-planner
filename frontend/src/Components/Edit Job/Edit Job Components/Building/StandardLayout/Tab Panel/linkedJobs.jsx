import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Grid, Typography } from "@mui/material";
import { LARGE_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import { unlinkESIJob } from "../../../../Edit Job Hooks/jobCommands";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useCurrentTime } from "../../../../../../Hooks/useCurrentTime";
import PanelFallBack from "../../../../panelStates";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import useLocationNames, {
  charactersByLocation,
} from "../../../../../../Hooks/EveEsi/useLocationNames";
import jobLocationCharacters from "../../../../../../Functions/IndustryJobs/jobLocationCharacters";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import { IndustryRunList } from "./industryRunList";
import { linkedRunRows } from "./runRows";

/**
 * Unlinking an ESI job removes a run from the job's `esi.industryJobs`
 * (persisted), so the gate is the active job lock — group locks cascade into it
 * automatically.
 */
export function LinkedJobsTab(props) {
  const { isLoading, isError, error } = props;
  const industryJobs = useJobDraft((job) => job.esi.industryJobs);
  const actions = useJobActions();
  const characters = useUsersStore((state) => state.account.characters);
  const queryClient = useQueryClient();
  const now = useCurrentTime();
  const jobLockReadOnly = useActiveJobReadOnly();

  const runs = useMemo(() => Object.values(industryJobs), [industryJobs]);
  const stationIds = useMemo(() => runs.map((run) => run.station_id), [runs]);
  const installers = useMemo(
    () => charactersByLocation(jobLocationCharacters(runs)),
    [runs],
  );
  const { names: facilityNames } = useLocationNames(stationIds, installers);

  const rows = linkedRunRows(runs, {
    characterByHash: (characterHash) =>
      characters?.find(
        (character) => character.CharacterHash === characterHash,
      ) ?? null,
    facilityNames,
    queryClient,
    now,
  });

  if (isLoading || isError) {
    return (
      <PanelFallBack isLoading={isLoading} isError={isError} error={error} />
    );
  }

  if (rows.length === 0) {
    return (
      <Grid
        align="center"
        sx={{ marginTop: { xs: "20px", sm: "30px" } }}
        size={12}
      >
        <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
          You currently have no industry jobs from the ESI linked to the this
          job.
        </Typography>
      </Grid>
    );
  }

  return (
    <IndustryRunList
      rows={rows}
      tooltip="Click anywhere on the card to unlink this job"
      disabledTooltip={lockReasonText({ action: "unlinking is disabled" })}
      disabled={jobLockReadOnly}
      onSelect={(row) => {
        actions.run(unlinkESIJob(row.run));
        actions.addIndustryESIJobsForRemoval(row.run.job_id);
        showSnackbarSuccess("Unlinked");
      }}
    />
  );
}
