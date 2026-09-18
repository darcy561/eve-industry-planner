import { Button, Skeleton, Stack } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { AccountEntry } from "./AccountEntry";
import useUsersStore from "../../Zustand/usersStore";
import { useLinkCharacter } from "./useLinkCharacter";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import { canonicalCharacterHashKey } from "../../Functions/Auth/characterHashCanonical.js";

/**
 * The characters an account holds, and where their tokens are kept.
 *
 * @param {object} props
 * @param {boolean} [props.includeMainCharacter] - false where the main character is already shown
 *   beside this roster, as first login shows it on its own card
 */
export function AdditionalAccounts({ includeMainCharacter = true }) {
  const characters = useUsersStore((state) => state.account.characters);
  const { linkCharacter, isLinking } = useLinkCharacter();

  return (
    <SectionPanel
      title={includeMainCharacter ? "Characters" : "Linked characters"}
      subtitle="Linking a character imports its ESI data alongside your main account's. Characters can be added and removed at any time."
      componentName="Characters"
      action={
        <Button
          variant="outlined"
          size="small"
          disabled={isLinking}
          onClick={() => linkCharacter()}
          sx={{
            borderRadius: 2,
            textTransform: "none",
            fontWeight: 600,
            borderColor: (theme) => alpha(theme.palette.primary.main, 0.35),
            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.55),
            "&:hover": {
              borderColor: "primary.main",
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
            },
          }}
        >
          Add Account
        </Button>
      }
    >
      {/* A column, not a grid: a row that grows when its ESI data opens pushes the rows below it
          down, rather than reflowing the roster and moving characters past each other. */}
      <Stack spacing={1} sx={{ width: "100%" }}>
        {isLinking ? (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Skeleton variant="circular" width={42} height={42} />
            <Skeleton variant="text" sx={{ flex: 1 }} />
            <Skeleton variant="circular" width={30} height={30} />
          </Stack>
        ) : (
          /* The main character first and marked, then the rest: one roster, one row shape.
             It carries no remove action — the account signs in as it. */
          [...characters]
            .filter(
              (character) =>
                includeMainCharacter || !character?.isMainCharacter,
            )
            .sort(
              (a, b) =>
                Number(Boolean(b?.isMainCharacter)) -
                Number(Boolean(a?.isMainCharacter)),
            )
            .map((character, index) => (
              <AccountEntry
                key={`${canonicalCharacterHashKey(character.CharacterHash)}-${index}`}
                character={character}
                isMain={Boolean(character?.isMainCharacter)}
              />
            ))
        )}
      </Stack>
    </SectionPanel>
  );
}
