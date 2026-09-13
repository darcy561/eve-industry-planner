import { Box, Stack, Typography } from "@mui/material";

import { FigureCaption } from "../Typography/figures";

/**
 * A labelled control: what it is, what it does, and the control itself.
 *
 * The label is the same caption a figure is named by, so a panel labels a
 * control and a number the one way. The control below keeps its own label.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} props.children
 */
export function FormField({ title, description, children }) {
  return (
    <Stack spacing={0.75}>
      {title ? <FigureCaption>{title}</FigureCaption> : null}
      {description ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ lineHeight: 1.5 }}
        >
          {description}
        </Typography>
      ) : null}
      <Box sx={{ pt: 0.25 }}>{children}</Box>
    </Stack>
  );
}
