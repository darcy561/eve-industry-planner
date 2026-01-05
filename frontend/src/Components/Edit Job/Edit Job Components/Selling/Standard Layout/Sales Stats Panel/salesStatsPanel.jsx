import { Typography, Grid } from "@mui/material";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";

export function SalesStats({ state }) {
  const brokersFeesTotal = state.activeJob.build.sale.brokersFee.reduce(
    (prev, item) => {
      return (prev += item.amount);
    },
    0
  );

  const { transactionFeeTotal, totalSale, averageQuantity } =
    state.activeJob.build.sale.transactions.reduce(
      (prev, item) => {
        return {
          transactionFeeTotal: prev.transactionFeeTotal + item.tax,
          totalSale: prev.totalSale + item.amount,
          averageQuantity: prev.averageQuantity + item.quantity,
        };
      },
      {
        transactionFeeTotal: 0,
        totalSale: 0,
        averageQuantity: 0,
      }
    );

  return (
    <ContentPanel componentName="Sales Stats Panel">
      <Grid container spacing={1}>
        <Grid container size={12}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Items Produced:
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              {formatNumberForLocale(state.activeJob.build.products.totalQuantity)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Build Cost:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(
                state.activeJob.build.costs.totalPurchaseCost +
                state.activeJob.build.costs.installCosts +
                state.activeJob.build.costs.extrasTotal
              )}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Brokers Fee Total:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(brokersFeesTotal)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Transaction Fee Total:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(transactionFeeTotal)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Job Cost:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(
                state.activeJob.build.costs.totalPurchaseCost +
                state.activeJob.build.costs.installCosts +
                state.activeJob.build.costs.extrasTotal +
                brokersFeesTotal +
                transactionFeeTotal
              )}
            </Typography>
          </Grid>
        </Grid>
        <Grid container sx={{ marginBottom: 1 }} size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Cost Per Item:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(
                Math.round(
                  ((state.activeJob.build.costs.totalPurchaseCost +
                    state.activeJob.build.costs.installCosts +
                    state.activeJob.build.costs.extrasTotal +
                    brokersFeesTotal +
                    transactionFeeTotal) /
                    state.activeJob.build.products.totalQuantity +
                    Number.EPSILON) *
                  100
                ) / 100
              )}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Total Of Sales:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {formatNumberForLocale(totalSale)}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Average Sale Price Per Item:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
            >
              {averageQuantity > 0
                ? formatNumberForLocale(
                  Math.round(
                    (totalSale / averageQuantity + Number.EPSILON) * 100
                  ) / 100
                )
                : 0.0}
            </Typography>
          </Grid>
        </Grid>
        <Grid container size={12}>
          <Grid
            size={{
              xs: 12,
              sm: 8
            }}>
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Profit/Loss:
            </Typography>
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 4
            }}>
            <Typography
              sx={{ typography: STANDARD_TEXT_FORMAT }}
              align="right"
              color={
                totalSale -
                  (state.activeJob.build.costs.totalPurchaseCost +
                    state.activeJob.build.costs.installCosts +
                    state.activeJob.build.costs.extrasTotal +
                    brokersFeesTotal +
                    transactionFeeTotal) <
                  0
                  ? "error"
                  : "primary"
              }
            >
              {formatNumberForLocale(
                totalSale -
                (state.activeJob.build.costs.totalPurchaseCost +
                  state.activeJob.build.costs.installCosts +
                  state.activeJob.build.costs.extrasTotal +
                  brokersFeesTotal +
                  transactionFeeTotal)
              )}
            </Typography>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
