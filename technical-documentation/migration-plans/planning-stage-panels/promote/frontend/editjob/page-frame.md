# The Edit Job page frame (`frontend/src/Components/Edit Job`)

Live SoT for what surrounds every Edit Job stage: the header, the stage tabs, and the controls that move
between stages and manage the job. It lives in `editJob.jsx`, `jobHeader.jsx`, `jobPurposeLine.jsx`,
`jobStageNavigation.jsx`, `deleteJobButton.jsx`, `DeleteJobConfirmDialogue.jsx`, `closeJobButton.jsx`
and `saveJobButton.jsx`. What each stage draws is that stage's own topic; the frame knows nothing about
them, and `EditJobStepContentSelector` switches on `jobStatus` alone.

## The surface

The frame is a plain outlined `Paper` on `appShellSetupSectionPaperSx` rather than an `AppShellPanel`,
which would wrap it in a title, an error boundary and loading states it has no use for — see
[../technical-rules.md](../technical-rules.md) § The app-shell surface has an owner. While the session
loads it shows the panel loading state with the session's message. The header and the tabs are held on
screen together, under the app bar. The header and tabs, the stage, and the Back and Continue pair each
sit inside their own error boundary, so a fault in one leaves the others drawn.

## The stages, as tabs

One tab per `applicationSettings.jobStatuses` entry, labelled with the stage's own name — players rename
stages, so no tab is labelled by position. The tabs read `Functions/Job/editing/jobStepNavigation.js`,
which permits any stage from any stage except the one open and, when `isFinalStepLockedForJob` holds,
the final one; selecting a tab sets `jobStatus`.

A shut final tab carries a lock and says why **for this job**, as a description rather than its name: a
job with parents has its output committed to them and is not sold on its own — "Its output is committed
to its 3 parent jobs, so it is not sold on its own." — and no control lifts that; any other grouped job
waits to be marked ready for sale on the stage before.

At the foot of the stage, one labelled pair moves in order — *Back to* the previous stage, as a text
button, and *Continue to* the next, filled, each naming its destination, running the step commands.
Continue into a shut final stage is disabled and carries the same reason.

## The header

The job's icon and name, and one line under it — the same commitment [output.md](./output.md)
states — reading "N for K parents (Name, Name, Name, +M more) — coverage · S setups". Up to three
parents are named, largest need first, each a link opening that job through `useOpenJob`; the rest,
loaded or not, are counted. The coverage is the shortfall, "covered exactly", "covered, N spare", or how
many parents are not loaded here. A job with no parents states what it has to sell and its setups.
The line wraps rather than truncating, so no parent's name is cut out of reach. `useOpenJob` is also how
Output's parent rows and the child-job drawer's *Open Child Job* open another job; a caller can pass
`onUnhandled` to ask before leaving where the page's own leave rules are absent, as *Open Child Job*
does when there are unsaved changes.
Beside them:

- whether there are **unsaved changes**, read from `useJobModified`;
- **Item tree**, outlined, which opens the job's dependency tree;
- **Delete**, outlined in the error colour and set apart by a rule either side. It confirms first,
  naming the job and, where it has parents, how many and how many units they lose;
- **Close**, outlined, which leaves the job as the session holds it underneath the reader's edits, and
  asks to save or discard first when there are unsaved changes. It is disabled while it is leaving;
- **Save & close**, filled when there is something to save and outlined when not. Saving ends the
  session, applying the parent and child links queued in it, so a save always leaves the page.

Delete and Save & close read the persist gate: while another session holds the job they are disabled
with the lock's reason. Close stays available, and its dialogue's Save is disabled instead, so a reader
can still leave without saving.

## Where leaving goes

`routeBackFromEditJob` (`Functions/Groups/groupPageViewSearch.js`) returns to the group and group-page
view the job was opened from, focusing the job on the group's tree, or to the planner. Save, Close,
Delete and handing the lock to another session all leave through it. Opening another job from the
editor carries the group and view forward through `editJobSearchToCarry`.
