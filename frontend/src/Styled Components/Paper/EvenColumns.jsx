import { Box } from "@mui/material";

/**
 * Children laid out in even columns that stack into one on a phone — fields side by side, or a pair
 * of cards to choose between.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {number} [props.columns] - how many side by side from a small screen up
 * @param {number} [props.gap] - theme spacing between them
 * @param {object} [props.sx]
 */
export function EvenColumns({ children, columns = 2, gap = 1.5, sx, ...rest }) {
  return (
    <Box
      sx={[
        {
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: `repeat(${columns}, minmax(0, 1fr))`,
          },
          gap,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </Box>
  );
}
