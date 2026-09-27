import { Tooltip } from "@mui/material";

/**
 * Says what a control does for a reader who cannot tell from its label, wrapping the
 * child so the tooltip opens even where that child takes no events of its own.
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
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <span tabIndex={focusable ? 0 : undefined}>{children}</span>
      ) : (
        children
      )}
    </Tooltip>
  );
}
