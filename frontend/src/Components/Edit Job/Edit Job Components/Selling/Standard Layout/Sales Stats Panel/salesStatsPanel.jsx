import { Typography, Grid } from "@mui/material";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { useBuildCost } from "../../../../Edit Job Hooks/useBuildCost";
import { useSellingTotals } from "../../../../Edit Job Hooks/useSellingTotals";
import { perItem, totalCostOf } from "../../../../Edit Job Hooks/jobSelectors";

export function SalesStats() {
  const { buildCost, produced } = useBuildCost();
  const {
    brokersFees: brokersFeesTotal,
    transactionFees: transactionFeeTotal,
    taxOutstanding: estimatedTaxOutstanding,
    sales: totalSale,
    averageSalePrice,
  } = useSellingTotals();
  const jobCost = totalCostOf({
    buildCost,
    brokersFees: brokersFeesTotal,
    transactionFees: transactionFeeTotal,
  });
  // Orders that have not sold yet carry the estimate made when they were linked.
  // Stated separately because it is a forecast, and mixing it into the charged
  // total would read as money already taken.

  return (
    <ContentPanel componentName="Sales Stats Panel">
      <Grid container spacing={1}>
        <Grid container size={12}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Items Built:
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(produced, {
                max: 0,
              })}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Build Cost:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(buildCost)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Broker Fees:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(brokersFeesTotal)}
            </Typography>
          </Grid>
        </Grid>
        {estimatedTaxOutstanding > 0 ? (
          <Grid container size={12}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                Estimated Tax On Unsold Orders:
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                sx={{ typography: STANDARD_TEXT_FORMAT }}
                align="right"
                color="text.secondary"
              >
                {formatNumberForLocale(estimatedTaxOutstanding)}
              </Typography>
            </Grid>
          </Grid>
        ) : null}
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Transaction Fees:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(transactionFeeTotal)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Job Cost:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(jobCost)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container sx={{ marginBottom: 1 }} size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Cost Per Item:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(perItem(jobCost, produced))}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Sales:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(totalSale)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Average Sale Price Per Item:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} align="right">
              {formatNumberForLocale(averageSalePrice)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Profit/Loss:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4,
            }}
          >
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
              color={totalSale - jobCost < 0 ? "error" : "primary"}
            >
              {formatNumberForLocale(totalSale - jobCost)}
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
