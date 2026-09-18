import { Stack } from "@mui/material";

import { AccountInfo } from "./accountInfo";
import { AdditionalAccounts } from "./AdditionalAccounts";
import { CorporationsPanel } from "./CorporationsPanel";
import { PlannersPanel } from "./PlannersPanel";
import { CitadelNamesCommunityPanel } from "./CitadelNamesCommunityPanel";

export default function AccountsPage() {
  return (
    // The page is a flex item in the layout's row, so it has to claim the row: without this it
    // shrinks to its widest section and sits against the left edge of the window.
    <Stack spacing={2} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
      <AccountInfo />
      <AdditionalAccounts />
      <CorporationsPanel />
      <PlannersPanel />
      <CitadelNamesCommunityPanel />
    </Stack>
  );
}
