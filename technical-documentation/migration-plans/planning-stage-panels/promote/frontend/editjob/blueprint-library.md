# Blueprint Library (`Edit Job Components/Planning/Standard Layout/Blueprint Library`)

Live SoT for the Planning stage's **Blueprint Library** — for a reaction, the **Formula Library**: the
blueprints or formulas the reader holds for this job, and applying one to the open setup. Which
blueprints a reader holds and how they are fetched is the blueprint collection's
([../esi-collections/blueprints.md](../esi-collections/blueprints.md)).

## What a row says

`useBlueprintLibrary` reads the reader's blueprint collection for the job's blueprint type and their
industry jobs, and pairs each blueprint with the active job running on it. A row states:

- the blueprint's artwork, original or copy, with its holder's portrait;
- ME and TE;
- *Original*, *Copy · 300 runs*, or while a job runs on a copy *Copy · 6 runs left of 20*, and who
  holds it;
- its state as a word: *Running a job* in the theme's warning colour, or *Runs out* in its error
  colour for a copy the running job will use up. That rule is `Functions/Blueprints/blueprintJobState.js`,
  which the standalone Blueprint Library page also reads.

The blueprint whose ME and TE the open setup already carries is marked *In this setup* and offers no
Use; where several match, the first is marked and says how many more do. The rows subscribe to the open
setup's ME and TE only, so editing anything else on the setup does not redraw the list.

## Using a blueprint

**Use** writes the blueprint's ME and TE to the open setup through `applySetupChange` — the setup
stores TE as half the blueprint's figure — and states what changed: *Setup now at ME 10 · TE 20, from
the copy with 50 runs left*. **Undo** beside it puts the setup's previous pair back on the setup it was
applied to. It stays only while the open setup is the one Use changed and still holds the pair Use
wrote; editing that setup by hand or opening another withdraws it, so it never overwrites a later
change.

## Reactions

A reaction formula carries no ME or TE, has no copies and restacks after use, so the panel is titled
**Formula Library** and has nothing to apply. One row per holder counts the formulas in their stacks
and how many are running a job. The holder building the open setup is marked: the setup's character,
or a corporation that character belongs to.

## Length and states

The blueprint list is a `FoldedList` with a limit of six, three on a phone: seven rows — four on a
phone — show whole, and past that the rest fold behind *Show N more*. A fold of a single row is not
worth a press, so it folds only once two or more rows would be hidden. The list scrolls with the page.
The formula rows are one per holder and do not fold.

The header counts what can be used: for a blueprint, the ones no job is running on, "4 free to use";
for a reaction, every formula held, "12 formulas". It is hidden while the panel loads and when the count
is nought. With nothing held, the panel says so — "No blueprints held for this item." or "No formulas
held for this reaction."

The panel draws nothing for a reader who is not signed in. Its loading and error states are the
panel's own, and come from both reads it makes: the blueprint collection and the industry jobs.
