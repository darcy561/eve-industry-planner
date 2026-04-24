import GroupPlannerAccordion from "./Accordion/AccordionFrame";
import GroupSchedulerFrame from "./Scheduler/schedularFrame";
import GroupBreakdownFrame from "./Breakdown/breakdownframe";

export default function GroupPageViewSelector(props) {
  const { state } = props;

  switch (state.pageView) {
    case "planner":
      return (
        <GroupPlannerAccordion
          jobArray={props.groupJobs}
          skeletonElementsToDisplay={state.skeletonElementsToDisplay}
          highlightedItems={state.highlightedItems}
          groupReadOnly={props.groupReadOnly}
        />
      );
    case "breakdown":
      return <GroupBreakdownFrame {...props} />;
    case "scheduler":
      return <GroupSchedulerFrame {...props} />;
    default:
      return null;
  }
}
