import GroupAccordionFrame from "./Accordion/AccordionFrame";
import GroupSchedulerFrame from "./Scheduler/schedularFrame";

export default function GroupPageViewSelector(props) {
    const { state } = props;

    switch (state.pageView) {
        case "planner":
            return <GroupAccordionFrame
                {...props}
            />;
        case "scheduler":
            return <GroupSchedulerFrame
                {...props}
            />;
        default:
            return null
    }
}