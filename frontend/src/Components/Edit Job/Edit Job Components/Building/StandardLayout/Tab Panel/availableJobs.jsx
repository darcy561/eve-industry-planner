import { Button, Grid, Tooltip, Typography } from "@mui/material";
import { MdOutlineAddLink } from "react-icons/md";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { LARGE_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { showSnackbarSuccess } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { linkESIJob } from "../../../../Edit Job Hooks/jobCommands";
import PanelFallBack from "../../../../panelStates";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { useCurrentTime } from "../../../../../../Hooks/useCurrentTime";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import useLocationNames, {
  charactersByLocation,
} from "../../../../../../Hooks/EveEsi/useLocationNames";
import jobLocationCharacters from "../../../../../../Functions/IndustryJobs/jobLocationCharacters";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import { jobSlotsOf } from "../../../../Edit Job Hooks/jobSelectors";
import { IndustryRunList } from "./industryRunList";
import { availableRunRows } from "./runRows";

/**
 * Linking an ESI job adds a run to the job's `esi.industryJobs` (persisted), so
 * it follows the active job lock. Group locks already cascade into the per-job
 * lock, so `useActiveJobReadOnly` is the right single-source gate.
 */
export function AvailableJobsTab(props) {
  const { jobMatches, isLoading, isError, error } = props;
  const setups = useJobDraft((job) => job.build.setup);
  const industryJobs = useJobDraft((job) => job.esi.industryJobs);
  const actions = useJobActions();
  const characters = useUsersStore((state) => state.account.characters);
  const queryClient = useQueryClient();
  const now = useCurrentTime();
  const jobLockReadOnly = useActiveJobReadOnly();

  const jobSlots = jobSlotsOf(setups);
  const freeSlots = jobSlots - Object.keys(industryJobs).length;
  const facilityIds = useMemo(
    () => jobMatches.map((job) => job.facility_id),
    [jobMatches],
  );
  const installers = useMemo(
    () => charactersByLocation(jobLocationCharacters(jobMatches, characters)),
    [jobMatches, characters],
  );
  const { names: facilityNames } = useLocationNames(facilityIds, installers);

  const rows = availableRunRows(jobMatches, {
    characterById: (characterID) =>
      characters?.find((character) => character.CharacterID === characterID) ??
      null,
    facilityNames,
    queryClient,
    now,
  });

  const linkRun = (row) => {
    actions.run(linkESIJob(row.run, row.owner));
    actions.addIndustryESIJobsForAddition(row.run.job_id);
  };

  const handleLinkAll = () => {
    if (jobLockReadOnly) return;
    for (const row of rows) {
      linkRun(row);
    }
    showSnackbarSuccess(`${rows.length} Jobs Linked`);
  };

  if (isLoading || isError) {
    return (
      <PanelFallBack isLoading={isLoading} isError={isError} error={error} />
    );
  }

  if (freeSlots <= 0) {
    return (
      <PanelMessage>
        You have linked the maximum number of jobs from the API, if you need to
        link more increase the number of job slots used.
      </PanelMessage>
    );
  }

  if (rows.length === 0) {
    return (
      <PanelMessage>
        There are no matching industry jobs from the API that match this job.
      </PanelMessage>
    );
  }

  return (
    <>
      <IndustryRunList
        rows={rows}
        tooltip="Click anywhere on the card to link this job"
        disabledTooltip={lockReasonText({ action: "linking is disabled" })}
        disabled={jobLockReadOnly}
        onSelect={(row) => {
          linkRun(row);
          showSnackbarSuccess("Linked");
        }}
      />
      {rows.length > 1 && (
        <Grid container sx={{ marginTop: 2 }}>
          <Grid align="right" size={12}>
            <Tooltip
              title={
                jobLockReadOnly
                  ? lockReasonText({ action: "bulk linking is disabled" })
                  : rows.length > freeSlots
                    ? "Cannot link all jobs: Not enough job slots available"
                    : "Click to link all available jobs at once"
              }
              arrow
            >
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleLinkAll}
                  disabled={jobLockReadOnly || rows.length > freeSlots}
                  startIcon={<MdOutlineAddLink />}
                >
                  Link All Jobs
                </Button>
              </span>
            </Tooltip>
          </Grid>
        </Grid>
      )}
    </>
  );
}

/**
 * @param {{children: import("react").ReactNode}} props
 */
function PanelMessage({ children }) {
  return (
    <Grid
      align="center"
      sx={{ marginTop: { xs: "20px", sm: "30px" } }}
      size={12}
    >
      <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
        {children}
      </Typography>
    </Grid>
  );
}
