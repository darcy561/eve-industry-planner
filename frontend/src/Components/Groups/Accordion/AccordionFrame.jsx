import { useCallback, useState } from "react";
import { Box } from "@mui/material";

import { ClassicGroupAccordionContent } from "./Classic View/ClassicGroupAccordionContent";
import { CompactGroupAccordionContent } from "./Compact View/CompactGroupAccordionContent";
import useUsersStore from "../../../Zustand/usersStore";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { useJobStatuses } from "../../Job Planner/Hooks/useJobStatuses";
import { PlannerStageAccordionShell } from "../../../Styled Components/PlannerStageAccordionShell/PlannerStageAccordionShell";

/**
 * One workflow stage on the group page: must register the same droppable ids as the job planner
 * (`planner-stage-{n}`) so @dnd-kit collision detection can resolve drops when dragging group job cards.
 */
function PlannerStageAccordionRow(props) {
  const { status, toggleExpanded, ...restContentsProps } = props;
  const contentsProps = { status, ...restContentsProps };
  const { plannerJobs } = contentsProps;
  const addToMultiSelect =
    useUsersStore.getState().jobData.actions.addToMultiSelect;

  return (
    <PlannerStageAccordionShell
      stageId={status.id}
      stageName={status.name}
      expanded={status.expanded}
      onToggle={() => toggleExpanded(status.id)}
      onSelectAll={() => {
        addToMultiSelect(plannerJobs.map((job) => job.jobID));
      }}
      classicContents={ClassicGroupAccordionContent}
      compactContents={CompactGroupAccordionContent}
      contentsProps={contentsProps}
    />
  );
}

export default function GroupPlannerAccordion({
  jobArray,
  groupReadOnly = false,
  skeletonElementsToDisplay,
  highlightedItems,
}) {
  const { jobStatuses } = useJobStatuses();
  const [collapsedStageIds, setCollapsedStageIds] = useState([]);

  const toggleExpanded = useCallback((stageId) => {
    setCollapsedStageIds((prev) => {
      if (prev.includes(stageId)) {
        return prev.filter((i) => i !== stageId);
      }
      return [...prev, stageId];
    });
  }, []);

  return (
    <ContentPanel
      componentName="GroupPlannerAccordion"
      paperSx={{ padding: 0 }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          width: "100%",
          height: "100%",
        }}
      >
        {jobStatuses.map((status) => {
          const plannerJobs = jobArray.filter(
            (job) => Number(job.jobStatus) === Number(status.id)
          );
          if (status.id === 4) return null;
          const statusForRow = {
            ...status,
            expanded: !collapsedStageIds.includes(status.id),
          };
          return (
            <PlannerStageAccordionRow
              key={status.id}
              status={statusForRow}
              toggleExpanded={toggleExpanded}
              plannerJobs={plannerJobs}
              skeletonElementsToDisplay={skeletonElementsToDisplay}
              highlightedItems={highlightedItems}
              groupReadOnly={groupReadOnly}
            />
          );
        })}
      </Box>
    </ContentPanel>
  );
}
