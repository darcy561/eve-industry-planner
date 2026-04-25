import GroupPlannerAccordion from "./Accordion/AccordionFrame";
import GroupSchedulerFrame from "./Scheduler/schedularFrame";
import GroupBreakdownFrame from "./Breakdown/breakdownframe";
import GroupJobTreeFlow from "./JobTree/groupJobTreeFlow";

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
          editReturnPageView={state.pageView}
        />
      );
    case "breakdown":
      return <GroupBreakdownFrame {...props} />;
    case "scheduler":
      return <GroupSchedulerFrame {...props} />;
    case "jobTree":
      return (
        <GroupJobTreeFlow
          groupJobs={props.groupJobs}
          routeGroupID={props.routeGroupID}
          editReturnPageView={state.pageView}
          highlightedItems={state.highlightedItems}
          focusJobId={props.focusJobId}
        />
      );
    default:
      return null;
  }
}
