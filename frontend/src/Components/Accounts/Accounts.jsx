import { Grid } from "@mui/material";
import { AccountInfo } from "./accountInfo";
import { AdditionalAccounts } from "./AdditionalAccounts";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";

export default function AccountsPage() {
  return (
    <DefaultPageLayout>
      <Grid container spacing={2}>
        <Grid size={12}>
          <AccountInfo />
        </Grid>
        <Grid size={12}>
          <AdditionalAccounts />
        </Grid>
      </Grid>
    </DefaultPageLayout>
  );
}
