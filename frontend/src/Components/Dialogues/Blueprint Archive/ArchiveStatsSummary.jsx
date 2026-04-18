import { Box, Grid, Typography } from "@mui/material";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";

const labelCol = { xs: 12, sm: 6 };
const valueCol = { xs: 12, sm: 6 };

function StatRow({ label, children }) {
  return (
    <Grid container size={12}>
      <Grid size={labelCol}>
        <Typography>{label}</Typography>
      </Grid>
      <Grid align="right" size={valueCol}>
        {children}
      </Grid>
    </Grid>
  );
}

export default function ArchiveStatsSummary({ data }) {
  const avgItemCost =
    data.itemBuildCount > 0
      ? formatNumberForLocale(
          ((data.jobCostTotal / data.itemBuildCount + Number.EPSILON) * 100) /
            100,
        )
      : formatNumberForLocale(0);

  return (
    <Box component="div" sx={{ width: "100%" }}>
      <Grid container>
        <StatRow label="Total Jobs:">
          <Typography>{data.totalJobs}</Typography>
        </StatRow>
        <StatRow label="Total Items Built:">
          <Typography>
            {formatNumberForLocale(data.itemBuildCount, { max: 0 })}
          </Typography>
        </StatRow>
        <StatRow label="Average Item Cost:">
          <Typography>{avgItemCost}</Typography>
        </StatRow>
        <StatRow label="Job Cost Total:">
          <Typography>{formatNumberForLocale(data.jobCostTotal)}</Typography>
        </StatRow>
        <StatRow label="Sales Total:">
          <Typography>{formatNumberForLocale(data.salesTotal)}</Typography>
        </StatRow>
        <StatRow label="Brokers Fee Total:">
          <Typography>{formatNumberForLocale(data.brokersFeeTotal)}</Typography>
        </StatRow>
        <StatRow label="Transaction Fee Total:">
          <Typography>
            {formatNumberForLocale(data.transactionFeeTotal)}
          </Typography>
        </StatRow>
        <StatRow label="Profit/Loss:">
          <Typography color={data.profitLoss >= 0 ? "primary" : "error"}>
            {formatNumberForLocale(data.profitLoss)}
          </Typography>
        </StatRow>
      </Grid>
    </Box>
  );
}
