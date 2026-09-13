import { Stack, Typography } from "@mui/material";

import useUsersStore from "../../Zustand/usersStore";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import { FigureCaption } from "../../Styled Components/Typography/figures";
import { MainCharacterCard } from "./MainCharacterCard";

export function AccountInfo() {
  const accountID = useUsersStore((state) =>
    state.account.actions.getAccountID(),
  );

  return (
    <SectionPanel title="Account" componentName="Account">
      <MainCharacterCard>
        <Stack spacing={0.25} sx={{ pt: 0.5 }}>
          <FigureCaption>Account ID</FigureCaption>
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
            {accountID ?? "—"}
          </Typography>
        </Stack>
      </MainCharacterCard>
    </SectionPanel>
  );
}
