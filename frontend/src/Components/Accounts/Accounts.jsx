import { Stack } from "@mui/material";

import { AccountInfo } from "./accountInfo";
import { AdditionalAccounts } from "./AdditionalAccounts";
import { CitadelNamesCommunityPanel } from "./CitadelNamesCommunityPanel";

export default function AccountsPage() {
  return (
    <Stack spacing={2}>
      <AccountInfo />
      <AdditionalAccounts />
      <CitadelNamesCommunityPanel />
    </Stack>
  );
}
