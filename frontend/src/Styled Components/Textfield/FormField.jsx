import { Box, Stack, Typography } from "@mui/material";

/**
 * A labelled control: what it is, what it does, and the control itself.
 *
 * The label is an overline rather than a field label so it reads as a heading
 * for the description beneath it — the control below keeps its own label.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} props.children
 */
export function FormField({ title, description, children }) {
  return (
    <Stack spacing={0.75}>
      {title ? (
        <Typography
          variant="overline"
          sx={{
            color: "primary.main",
            letterSpacing: 0.06,
            lineHeight: 1.25,
            display: "block",
          }}
        >
          {title}
        </Typography>
      ) : null}
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
