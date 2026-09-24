import { Tooltip } from "@mui/material";

/**
 * What a control does, for a reader who cannot tell from its label.
 *
 * The house spelling — arrow, above the control, and a `<span>` so the tooltip
 * still opens on a disabled button — written once. MUI attaches its listeners to
 * the child element, and a disabled button fires none, so the wrapper is the only
 * way a reader can find out *why* it is disabled.
 *
 * Renders the child alone when there is nothing to say, so a caller can hand it a
 * title that is empty in some states without branching at the call site. That
 * matters because the state most needing an explanation is often the one a
 * conditional title leaves empty.
 *
 * `wrap={false}` hands the tooltip straight to the child. Use it where the child
 * already takes listeners and carries its own `aria-label`: MUI clones its props
 * onto the wrapper, so a labelled child inside one is announced twice.
 *
 * `focusable` puts the wrapper in the tab order, which is the only way a reader
 * who does not use a mouse can open a tooltip on something that takes no focus
 * of its own — a chip, an icon, a dash. Opt-in rather than the default because a
 * tab stop on every explained control would be a long walk through a page; take
 * it where the tooltip carries something the reader cannot get any other way.
 *
 * Give it a **string** title. MUI labels the wrapper with a string title whether
 * the tooltip is open or not, so the sentence reaches assistive technology on
 * focus alone; a `ReactNode` title is only announced once the tooltip has
 * opened, which leaves the tab stop unlabelled until then.
 *
 * A tooltip that restates its own label is worse than none: it costs a hover and
 * teaches nothing. Say what the control *does*, what it affects, or what it
 * costs.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.title] - Empty renders the child alone
 * @param {React.ReactElement} props.children
 * @param {import("@mui/material").TooltipProps["placement"]} [props.placement]
 * @param {boolean} [props.wrap] - False where the child takes the listeners itself
 * @param {boolean} [props.focusable] - True where the child cannot take focus and
 *   the tooltip is the only place its explanation lives
 * @returns {React.ReactElement}
 */
export default function ExplainerTooltip({
  title,
  children,
  placement = "top",
  wrap = true,
  focusable = false,
  ...rest
}) {
  if (!title) return children;

  return (
    <Tooltip title={title} arrow placement={placement} {...rest}>
      {wrap ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the span is not a control and does not pretend to be one; it is how a reader who does not use a mouse reaches a description that has nowhere else to live.
        <span tabIndex={focusable ? 0 : undefined}>{children}</span>
      ) : (
        children
      )}
    </Tooltip>
  );
}
