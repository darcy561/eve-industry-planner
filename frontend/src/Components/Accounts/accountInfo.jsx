import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import useUsersStore from "../../Zustand/usersStore";
import writeTextToClipboard from "../../Functions/Clipboard/writeTextToClipboard";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import { FigureCaption } from "../../Styled Components/Typography/figures";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";
import { useMainCharacter } from "./useMainCharacter";
import { TokenStorageChoice } from "./TokenStorageChoice";

/**
 * Who the account is: the character it signs in as, and the id that identifies it.
 *
 * The roster below lists that character again, as a row among the others, because it is one —
 * this section is about the account rather than about any character in it.
 */
export function AccountInfo() {
  const accountID = useUsersStore((state) =>
    state.account.actions.getAccountID(),
  );
  const { character: main, name } = useMainCharacter();
  const corporation = useUsersStore((state) =>
    state.account.actions.getCorporation(main?.corporation_id),
  );
  const alliance = useUsersStore((state) =>
    state.account.actions.getAlliance(corporation?.alliance_id),
  );

  return (
    <SectionPanel title="Account" componentName="Account">
      {/* Two blocks, not three columns. The storage choice carries a sentence, so it asks for a
          wide flex base and its sibling gives way proportionally — which is how the identity came
          to render one character per line on a tablet. The identity keeps a floor and the storage
          block a ceiling, so neither can starve the other. */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" } }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{
            // Only where the band is a row: a flex basis is measured along the main axis, so at
            // `xs` — a column — a 260px floor is 260px of height, and the band grows a hole.
            flex: { sm: "1 1 260px" },
            minWidth: { sm: 260 },
            alignItems: "flex-start",
          }}
        >
          <EveImageAvatar
            alt={`${name} portrait`}
            character={main?.CharacterID ?? undefined}
            size={64}
            variant="rounded"
          />
          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <Stack spacing={0.5}>
              <Typography variant="h6" component="p" sx={{ fontWeight: 600 }}>
                {name}
              </Typography>
              {/* Who this character flies for, rather than a count of what the sections below
                  already list. An account with one alt read "4 linked" where three of the four
                  were linked and the fourth was this character. */}
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ alignItems: "center", flexWrap: "wrap", minWidth: 0 }}
              >
                {corporation ? (
                  <>
                    <EveImageAvatar
                      alt={`${corporation.corporationName} logo`}
                      corporation={corporation.corporation_id}
                      size={18}
                      variant="rounded"
                    />
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {corporation.corporationName}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No corporation
                  </Typography>
                )}
                {alliance && (
                  <>
                    <EveImageAvatar
                      alt={`${alliance.allianceName} logo`}
                      alliance={alliance.alliance_id}
                      size={18}
                      variant="rounded"
                    />
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {alliance.allianceName}
                    </Typography>
                  </>
                )}
              </Stack>
            </Stack>

            <Stack spacing={0.25}>
              <FigureCaption>Account ID</FigureCaption>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                >
                  {accountID ?? "—"}
                </Typography>
                {accountID && (
                  <Tooltip title="Copy account ID">
                    <IconButton
                      size="small"
                      aria-label="Copy account ID"
                      onClick={() =>
                        writeTextToClipboard(accountID, "Account ID copied")
                      }
                    >
                      <ContentCopyIcon fontSize="inherit" color="primary" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>
          </Stack>
        </Stack>

        <Box
          sx={{
            minWidth: 0,
            width: { xs: "100%", sm: "auto" },
            maxWidth: { sm: 360 },
          }}
        >
          <TokenStorageChoice />
        </Box>
      </Stack>
    </SectionPanel>
  );
}
