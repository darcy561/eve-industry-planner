import { Card, Grid, Skeleton } from "@mui/material";

const gridItemSize = {
  xs: 12,
  sm: 6,
  md: 4,
  lg: 3,
};

/**
 * Classic layout: responsive grid tiles (planning stage loading placeholders).
 *
 * @param {{ count: number }} props
 */
export function PlannerClassicJobSkeletonGrid({ count }) {
  if (!count) {
    return null;
  }
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <Grid
          key={index}
          sx={{ minHeight: 200, width: "100%" }}
          size={gridItemSize}
        >
          <Skeleton
            variant="rectangular"
            animation="wave"
            width="100%"
            height="100%"
          />
        </Grid>
      ))}
    </>
  );
}

const compactRowSx = {
  marginY: 0.5,
  padding: 0,
  height: 40,
};

/**
 * Compact layout: full-width card strips (planning stage loading placeholders).
 *
 * @param {{ count: number }} props
 */
export function PlannerCompactJobSkeletonList({ count }) {
  if (!count) {
    return null;
  }
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} sx={compactRowSx}>
          <Skeleton
            variant="rectangular"
            animation="wave"
            width="100%"
            height="100%"
          />
        </Card>
      ))}
    </>
  );
}
