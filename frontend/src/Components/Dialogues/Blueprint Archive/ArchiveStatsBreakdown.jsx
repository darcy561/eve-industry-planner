import { Divider, Grid, Paper, Stack, Typography } from "@mui/material";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";

const labelCol = { xs: 12, sm: 6 };
const valueCol = { xs: 12, sm: 6 };

/** full = build + sale columns; buildRetained / buildChain = build only + footer note */
const METRICS_FULL = "full";
const METRICS_BUILD_RETAINED = "buildRetained";
const METRICS_BUILD_CHAIN = "buildChain";

/** @param {{ label: string, children: import('react').ReactNode }} props */
function StatRow({ label, children }) {
  return (
    <Grid container size={12}>
      <Grid size={labelCol}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Grid>
      <Grid align="right" size={valueCol}>
        {children}
      </Grid>
    </Grid>
  );
}

/**
 * @param {object} bucket — output of accumulateArchiveBucketStats
 */
function avgBuildCostPerItem(bucket) {
  if (!bucket.itemBuildCount || bucket.itemBuildCount <= 0) {
    return formatNumberForLocale(0);
  }
  return formatNumberForLocale(
    ((bucket.jobCostTotal / bucket.itemBuildCount + Number.EPSILON) * 100) / 100,
  );
}

/**
 * @param {object} bucket
 */
function avgSalePerSoldUnit(bucket) {
  if (!bucket.totalSoldQuantity || bucket.totalSoldQuantity <= 0) {
    return "—";
  }
  return formatNumberForLocale(
    ((bucket.salesTotal / bucket.totalSoldQuantity + Number.EPSILON) * 100) / 100,
  );
}

/**
 * @param {{
 *   title: string,
 *   bucket: object,
 *   metricsMode?: typeof METRICS_FULL | typeof METRICS_BUILD_RETAINED | typeof METRICS_BUILD_CHAIN,
 * }} props
 */
function BucketSection({ title, bucket, metricsMode = METRICS_FULL }) {
  const hasActivity =
    bucket.totalJobs > 0 ||
    bucket.itemBuildCount > 0 ||
    bucket.jobCostTotal > 0;

  if (!hasActivity) {
    return null;
  }

  const showSaleMetrics = metricsMode === METRICS_FULL;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        bgcolor: "action.hover",
      }}
    >
      {title ? (
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.25 }}>
          {title}
        </Typography>
      ) : null}
      <Grid container spacing={0.5}>
        <StatRow label="Archived jobs">
          <Typography variant="body2">{bucket.totalJobs}</Typography>
        </StatRow>
        <StatRow label="Total items built">
          <Typography variant="body2">
            {formatNumberForLocale(bucket.itemBuildCount, { max: 0 })}
          </Typography>
        </StatRow>
        <StatRow label="Avg build cost / item">
          <Typography variant="body2">{avgBuildCostPerItem(bucket)}</Typography>
        </StatRow>
        <StatRow label="Job cost total">
          <Typography variant="body2">
            {formatNumberForLocale(bucket.jobCostTotal)}
          </Typography>
        </StatRow>
        {showSaleMetrics ? (
          <>
            <StatRow label="Items sold (qty on transactions)">
              <Typography variant="body2">
                {formatNumberForLocale(bucket.totalSoldQuantity ?? 0, {
                  max: 0,
                })}
              </Typography>
            </StatRow>
            <StatRow label="Avg sale / sold unit">
              <Typography variant="body2">
                {avgSalePerSoldUnit(bucket)}
              </Typography>
            </StatRow>
            <StatRow label="Sales total">
              <Typography variant="body2">
                {formatNumberForLocale(bucket.salesTotal)}
              </Typography>
            </StatRow>
            <StatRow label="Brokers fee total">
              <Typography variant="body2">
                {formatNumberForLocale(bucket.brokersFeeTotal)}
              </Typography>
            </StatRow>
            <StatRow label="Transaction fee total">
              <Typography variant="body2">
                {formatNumberForLocale(bucket.transactionFeeTotal)}
              </Typography>
            </StatRow>
            <StatRow label="Profit / loss">
              <Typography
                variant="body2"
                color={(bucket.profitLoss ?? 0) >= 0 ? "primary" : "error"}
              >
                {formatNumberForLocale(bucket.profitLoss)}
              </Typography>
            </StatRow>
          </>
        ) : (
          <Grid size={12} sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {metricsMode === METRICS_BUILD_CHAIN
                ? "Build-side only: chain steps are treated as feeding the next blueprint. Sale and fee lines are not shown in this block (see Combined or Market for revenue totals attributed to this archive)."
                : "Build-side only: no sale or broker-fee lines on this archived row for these jobs — treated as stock kept or used outside this row’s market activity."}
            </Typography>
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}

/**
 * Segment breakdown from archived snapshot rows (same grouping rules as worker Mongo breakdown).
 */
export default function ArchiveStatsBreakdown({ breakdown }) {
  if (!breakdown) {
    return null;
  }

  const {
    productionChain,
    retainedFullStock,
    standaloneWithRecordedSale,
    combined,
  } = breakdown;

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="body2" color="text.secondary">
        How this is grouped: Combined rolls up Market + Stock + Chain — same sales,
        broker fees, transaction fees, and job costs as the three blocks below (including
        builds treated as unsold or chain steps). Profit / loss on each block is sales minus
        those fees minus job cost for that block; Combined uses the summed dollar fields,
        then net profit from those totals.
      </Typography>

      <BucketSection
        title="Combined — all jobs (this blueprint type)"
        bucket={combined}
        metricsMode={METRICS_FULL}
      />

      <Divider />

      <BucketSection
        title="Market — job contained market activity"
        bucket={standaloneWithRecordedSale}
        metricsMode={METRICS_FULL}
      />
      <BucketSection
        title="Stock — job contained no market activity and not part of a production chain"
        bucket={retainedFullStock}
        metricsMode={METRICS_BUILD_RETAINED}
      />
      <BucketSection
        title="Chain — job is part of a production chain"
        bucket={productionChain}
        metricsMode={METRICS_BUILD_CHAIN}
      />
    </Stack>
  );
}
