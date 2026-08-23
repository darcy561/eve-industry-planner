import { Divider, Grid, Paper, Stack, Typography } from "@mui/material";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";

const labelCol = { xs: 12, sm: 6 };
const valueCol = { xs: 12, sm: 6 };

/**
 * How much of a block to show.
 *
 * Stock and Chain jobs have no market activity of their own, so their sale and
 * fee rows would read as zeros against real build costs. Those blocks show the
 * build side and say why the rest is missing.
 */
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

/** @param {object} bucket */
function avgBuildCostPerItem(bucket) {
  if (!bucket.itemBuildCount || bucket.itemBuildCount <= 0) {
    return formatNumberForLocale(0);
  }
  return formatNumberForLocale(bucket.jobCostTotal / bucket.itemBuildCount);
}

/**
 * Average revenue per unit actually sold.
 *
 * A dash rather than zero when nothing sold: no unit has a price yet, which is a
 * different statement from every unit fetching nothing.
 *
 * @param {object} bucket
 */
function avgSalePerSoldUnit(bucket) {
  if (!bucket.totalSoldQuantity || bucket.totalSoldQuantity <= 0) {
    return "—";
  }
  return formatNumberForLocale(bucket.salesTotal / bucket.totalSoldQuantity);
}

/**
 * @param {{
 *   title: string,
 *   bucket: object,
 *   metricsMode?: typeof METRICS_FULL | typeof METRICS_BUILD_RETAINED | typeof METRICS_BUILD_CHAIN,
 * }} props
 */
function BucketSection({ title, bucket, metricsMode = METRICS_FULL }) {
  // An empty segment is omitted rather than shown as zeros: a reader who never
  // built through a production chain should not have to read a block of noughts
  // to learn that.
  const hasActivity =
    bucket.totalJobs > 0 || bucket.itemBuildCount > 0 || bucket.jobCostTotal > 0;

  if (!hasActivity) {
    return null;
  }

  const showSaleMetrics = metricsMode === METRICS_FULL;

  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
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
                {formatNumberForLocale(bucket.totalSoldQuantity ?? 0, { max: 0 })}
              </Typography>
            </StatRow>
            <StatRow label="Avg sale / sold unit">
              <Typography variant="body2">{avgSalePerSoldUnit(bucket)}</Typography>
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
                ? "Build-side only: chain steps feed the next blueprint rather than the market. Revenue for this type appears under Market and Combined."
                : "Build-side only: these jobs recorded no sale or broker fee — output kept as stock, or sold outside this row's market activity."}
            </Typography>
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}

/**
 * A type's lifetime archive figures, split by what happened to the output.
 *
 * The three segments partition the jobs — a build feeds another build, is kept as
 * stock, or is sold — so Combined is their sum rather than a fourth measurement.
 *
 * @param {{ breakdown: object|null }} props
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
        Combined rolls up Market, Stock and Chain. Every job counts towards
        exactly one of the three, so the blocks below add up to it. Profit and
        loss already accounts for broker and transaction fees.
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
