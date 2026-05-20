import { Box } from "@mui/material";
import { CompactAccordionContents } from "./Compact/CompactContents";
import { ClassicAccordionContents } from "./Classic/classicContents";
import { filterJobsForJobPlannerStage } from "../../../Functions/JobPlanner/plannerAccordionJobFilters";
import useUsersStore from "../../../Zustand/usersStore";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { useJobStatuses } from "../Hooks/useJobStatuses";
import { PlannerStageAccordionShell } from "../../../Styled Components/PlannerStageAccordionShell/PlannerStageAccordionShell";
import { filterUnlockedDocumentIDs } from "../../../Functions/DocumentLock/documentLockSelectors";
import { USER_JOBS_COLLECTION } from "../../../Functions/DocumentLock/documentLockCollections";

function PlannerStageAccordionRow(props) {
  const { status, toggleExpanded, ...restContentsProps } = props;
  const contentsProps = { status, ...restContentsProps };
  const jobArray = useUsersStore((state) => state.jobData.jobArray);
  const addToMultiSelect =
    useUsersStore.getState().jobData.actions.addToMultiSelect;

  return (
    <PlannerStageAccordionShell
      stageId={status.id}
      stageName={status.name}
      expanded={status.expanded}
      onToggle={() => toggleExpanded(status.id)}
      onSelectAll={() => {
        const stageJobIDs = filterJobsForJobPlannerStage(
          jobArray,
          status.id
        ).map((job) => job.jobID);
        addToMultiSelect(
          filterUnlockedDocumentIDs(
            useUsersStore.getState(),
            USER_JOBS_COLLECTION,
            stageJobIDs
          )
        );
      }}
      classicContents={ClassicAccordionContents}
      compactContents={CompactAccordionContents}
      contentsProps={contentsProps}
    />
  );
}

export function PlannerAccordion(props) {
  const { jobStatuses, toggleExpanded } = useJobStatuses();

  return (
    <ContentPanel
      componentName="PlannerAccordion"
      paperSx={{
        padding: 0,
      }}
      contentGridSx={{
        overflow: "visible",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          width: "100%",
        }}
      >
        {jobStatuses.map((status) => (
          <PlannerStageAccordionRow
            key={status.id}
            status={status}
            toggleExpanded={toggleExpanded}
            {...props}
          />
        ))}
      </Box>
    </ContentPanel>
  );
}
