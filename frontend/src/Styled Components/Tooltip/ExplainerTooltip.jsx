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
 * A tooltip that restates its own label is worse than none: it costs a hover and
 * teaches nothing. Say what the control *does*, what it affects, or what it
 * costs.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.title] - Empty renders the child alone
 * @param {React.ReactElement} props.children
 * @param {import("@mui/material").TooltipProps["placement"]} [props.placement]
 * @returns {React.ReactElement}
 */
export default function ExplainerTooltip({
  title,
  children,
  placement = "top",
  ...rest
}) {
  if (!title) return children;

  return (
    <Tooltip title={title} arrow placement={placement} {...rest}>
      <span>{children}</span>
    </Tooltip>
  );
}
