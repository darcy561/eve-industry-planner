# Output (`Edit Job Components/Planning/Standard Layout/Output`)

Live SoT for the Planning stage's **Output** panel: what the job produces, how much of it is owed to the
jobs above it, and those parent jobs as rows. Choosing a parent to link is
[parent-job-link.md](./parent-job-link.md); what committed output is worth to the parents, and why it
carries no sale figures, is [returns.md](./returns.md).

## One commitment, read once

What the parents need, what other jobs make towards it, the shortfall, what is free to sell and the
parent rows all come from `useJobCommitment` (`Hooks/Planner/useJobCommitment.js`), the hook Returns,
Cost Breakdown and Skills read, so no two panels can state a different commitment. What the job
produces, its runs and the longest setup are worked out from the setups themselves.
`Functions/Groups/parentRequirements.js` works it out:

- **Having parents** is what commits a job's output. Whether the job is in a group plays no part.
- The parents' requirement is shared across every job feeding it — this one and its siblings — in job
  id order, each taking what is left after the ones before it. The order is arbitrary but the same
  whichever child asks, so two children never both report the same spare stock.
- The **shortfall** is what remains of the requirement after every job feeding it. It is a fact about
  the parents, not about the order the children were taken in, so it is the one figure the headline,
  the sentence beneath it, each row and the page header all state.
- Each parent's own coverage shares that shortfall out largest need first, so the smallest asks are the
  ones left short.

## What the panel states

The headline is the job's output. Beside it stand what the parents need — with the shortfall, or with
how much other jobs make towards it — and what is free to sell. One sentence under the headline says
where the job stands against its parents:

- falling short, how much of the requirement is met and how many more runs on any setup cover it;
- covering them exactly, that taking runs off any setup leaves the parents short ("Taking runs off
  leaves the parents short." on a job with one setup);
- with some spare, what is owed and what is spare — "1,200 owed, 300 spare."

Under the rows, the arithmetic is one line — per run × runs over setups — and the time is the
**longest setup**, naming the slots it assumes: "6 slots side by side — the wait if every one can
start at once". The app does not know how many slots a character can install at once, so the figure is
the wait if they all can.

## The parent rows

One row per linked parent, largest need first: its icon, and its name, which opens that job; what it needs;
whether it is covered or how short it is; and a muted unlink that turns red on hover and is disabled,
with the lock's reason, while another session holds the job. A parent that does not use this item is
still a row, marked *uses none*, so the link can be taken off. Up to seven rows show whole; past seven,
six show and the rest fold behind a line counting them, what they need between them and whether they
are covered. A fold of a single row is not worth a press, so it folds only once two or more rows would
be hidden.

A parent not loaded on this page cannot be drawn. The panel counts it from the job's parent ids and
says how many are *not loaded here*, rather than reading their need as met.

**Link a parent** is the panel's header action, disabled with the lock's reason while another session
holds the job. Linking and unlinking happen on the Planning stage
only; every other stage has the page header's summary line — see [page-frame.md](./page-frame.md).
