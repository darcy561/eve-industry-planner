# Price history chart (`frontend/src/Styled Components/LineGraph/priceHistory.jsx`)

Live SoT for the windowed price history graph, reachable from the dashboard,
the group page, the job planner, reprocessing, and Edit Job through
[`Components/Dialogues/Price History`](../../../frontend/src/Components/Dialogues/Price History).

## The visible window

The chart shows high/low bands, an average line, and traded volume against
time, with a slider (`ChartRangeSlider`) letting the reader narrow the visible
range. It opens on a **trailing window** — the last month of history, or the
last week on a screen at the phone breakpoint — computed as the state's
initial value, so the chart is already showing the right window on the first
painted frame.

## When the window resets

The visible range goes back to the trailing window whenever the series itself
changes — a different item or region — or when the reader's screen crosses
the phone breakpoint, since that changes what "trailing window" means. A
window the reader has dragged is otherwise left alone: neither a re-render
nor new rows arriving for the same series moves the slider under them.

## Region picker

The region `Select` next to the chart calls `updateRegionID`, supplied by the
caller; the chart itself has no opinion on which regions are offered.
