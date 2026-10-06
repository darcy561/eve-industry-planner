import { EvenColumns } from "../../Styled Components/Paper/EvenColumns";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import SelectableCard from "../../Styled Components/Paper/SelectableCard";
import { reprocessingDirections } from "./Hooks/reprocessingReducer";

const DIRECTIONS = [
  {
    direction: reprocessingDirections.toMinerals,
    title: "To minerals",
    body: "What my items give, and what that is worth",
  },
  {
    direction: reprocessingDirections.fromMinerals,
    title: "From minerals",
    body: "The ore to buy for minerals I need",
  },
];

/** Which way the page reprocesses, chosen from two cards; each direction keeps its own paste. */
export default function DirectionPanel({ pageState, pageActions }) {
  return (
    <SectionPanel title="Reprocessing">
      <EvenColumns
        component="fieldset"
        role="radiogroup"
        aria-label="Direction"
        sx={{ border: "none", m: 0, p: 0 }}
      >
        {DIRECTIONS.map(({ direction, title, body }) => (
          <SelectableCard
            key={direction}
            selected={pageState.direction === direction}
            onSelect={() => pageActions.setDirection(direction)}
            title={title}
            body={body}
            stacked
          />
        ))}
      </EvenColumns>
    </SectionPanel>
  );
}
