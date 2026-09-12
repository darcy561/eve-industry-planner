# Tutorial cards (`frontend/src/Components/Tutorials/tutorialTemplate.jsx`)

Live SoT for the help cards shown on the dashboard, the job planner's side
menu, and each Edit Job step. `TutorialTemplate` is the one component; each
caller supplies its own `TutorialContent`.

## Showing and hiding

A card is visible while tutorials are turned on for the account, or while
nobody is signed in. Turning tutorials off fades the card out over a second
using MUI's `Fade`, with `unmountOnExit` so nothing of the card remains
mounted once the fade ends; turning them back on fades it straight back in.
`Fade` owns both when the card is mounted and when the fade is considered
finished — nothing beside it tracks a duration or an unmount flag of its own.

## The dashboard's tutorial row

The dashboard keeps the row that holds the card mounted until the card's own
fade-out finishes — `onFadeOutComplete` is what lets the row go — so the
panels beneath it do not jump up mid-animation. The row comes back the moment
help is wanted again; it does not wait on anything finishing to reappear,
only to disappear.
