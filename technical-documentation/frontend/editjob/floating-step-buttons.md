# Floating step buttons (`frontend/src/Components/Edit Job/editJob.jsx`, `Hooks/GeneralHooks/useIsScrolledOutOfView.js`)

Live SoT for the floating previous/next-step arrows on a long Edit Job step.

## What shows the arrow

Each of the two step controls — previous and next — has a floating stand-in that
appears once the control it stands in for has scrolled off screen, and disappears
once it is back in view. `useIsScrolledOutOfView` owns the watch: it attaches an
`IntersectionObserver` to the element through a ref callback and answers whether
that element is currently out of view, threshold `0.15` by default. `editJob.jsx`
calls it once per control and shows the floating arrow when the hook says out of
view **and** the move is available (`canMoveBackward` / `canMoveForward`).

There is no case where the floating arrow shows because the control could not be
found — the control is always drawn when the move is available, so "out of view"
and "not observed yet" cannot both apply to a control the reader can act on.

## Reuse

The hook is general-purpose: it takes an optional visibility threshold, returns
`[isOutOfView, ref]`, and re-observes automatically if the ref is attached to a
different element, so a caller that swaps which control it is watching does not
need to manage the observer's lifecycle itself.
