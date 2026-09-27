# Explainer tooltip (`Styled Components/Tooltip`)

Live SoT for how the SPA explains a control a reader cannot work out from its label.
[`ExplainerTooltip`](../../../frontend/src/Styled%20Components/Tooltip/ExplainerTooltip.jsx) is the
one spelling of that: a MUI `Tooltip`, with the arrow, over a `<span>` wrapper.

| Prop | Default | What it is for |
|------|---------|----------------|
| `title` | — | Empty renders the child alone, with no tooltip at all |
| `placement` | `"top"` | Any MUI placement; a caller naming one overrides the default |
| `wrap` | `true` | `false` hands the tooltip straight to the child, with no span |
| `focusable` | `false` | `true` puts the wrapper in the tab order |

Anything else is spread onto the MUI `Tooltip`, after the arrow, so a caller can override that too.

```jsx
<ExplainerTooltip title="Bought for more than the job needs; the excess is not charged to it.">
  <StatusChip label="Excess" />
</ExplainerTooltip>
```

## Why there is a wrapper

MUI attaches the tooltip's listeners to the child element, and a **disabled** button fires none. The
`<span>` is what keeps the tooltip reachable on exactly the control whose disabled state most needs
explaining.

`wrap={false}` hands the tooltip straight to the child instead. Take it where the child already
receives listeners and carries its own `aria-label`: MUI clones its props onto whatever it wraps, so a
labelled child inside the span is announced twice.

## An empty title renders the child alone

A caller may pass a title that is empty in some states without branching at the call site — the
component returns the child untouched. This is the common case rather than an edge one, because the
state that most needs an explanation is usually the one a conditional title leaves empty.

## `focusable`, and who can reach a tooltip

`focusable` puts the wrapper in the tab order. It is the only way a reader who does not use a mouse
can open a tooltip on something that takes no focus of its own — a chip, an icon, a dash.

It is **opt-in rather than the default**, because a tab stop on every explained control is a long walk
through a page. Take it where the tooltip carries something the reader cannot get any other way: the
market table's "Last read" cell does, because the tooltip is the only place the fix for a failed read
is described (see [../settings/market-locations.md](../settings/market-locations.md)).

The `jsx-a11y/no-noninteractive-tabindex` disable inside the component is for this: the span is not a
control and does not pretend to be one, and the tab stop exists so a description with nowhere else to
live can be reached.

## Give it a string title

MUI labels the wrapper with a **string** title whether the tooltip is open or not, so the sentence
reaches assistive technology on focus alone. A `ReactNode` title is announced only once the tooltip has
opened, which leaves a `focusable` tab stop unlabelled until then. Pass markup only where nothing is
relying on the label.

## What a tooltip should say

A tooltip that restates its own label is worse than none: it costs a hover and teaches nothing. Say
what the control **does**, what it affects, or what it costs.
