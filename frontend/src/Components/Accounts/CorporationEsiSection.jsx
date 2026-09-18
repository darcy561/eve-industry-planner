import { Stack, Typography } from "@mui/material";

import useUsersStore from "../../Zustand/usersStore";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";
import EntityRow from "../../Styled Components/Paper/EntityRow";
import { Disclosure } from "../../Styled Components/Typography/figures";
import CorporationEsiStatus from "./CorporationEsiStatus";

/**
 * What the application holds for each corporation the account's characters belong to.
 *
 * One row per corporation rather than one per member: ESI returns a corporation's blueprints,
 * jobs, orders and wallets whole to any member holding the role, so the data is the corporation's
 * and showing it inside each member's row would show one fetch once per member.
 */
export default function CorporationEsiSection() {
  const corporations = useUsersStore((state) => state.account.corporations);
  const findCharacterByHash = useUsersStore(
    (state) => state.account.actions.findCharacterByHash,
  );

  if (!corporations?.length) return null;

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      {corporations.map((corporation) => {
        const members = corporation.members ?? [];
        return (
          <EntityRow
            key={corporation.corporation_id}
            avatar={
              <EveImageAvatar
                alt={`${corporation.corporationName} logo`}
                corporation={corporation.corporation_id}
                size={42}
                variant="rounded"
              />
            }
            name={corporation.corporationName}
            context={
              <Typography variant="body2" color="text.secondary" noWrap>
                {members.length === 1
                  ? "1 character linked"
                  : `${members.length} characters linked`}
              </Typography>
            }
            status={
              <Stack direction="row" spacing={0.5}>
                {members.map((memberHash) => {
                  const member = findCharacterByHash(memberHash);
                  if (!member) return null;
                  return (
                    <EveImageAvatar
                      key={memberHash}
                      alt={`${member.CharacterName} portrait`}
                      character={member.CharacterID}
                      size={24}
                      variant="rounded"
                    />
                  );
                })}
              </Stack>
            }
          >
            <Disclosure label="ESI data">
              <CorporationEsiStatus
                corporationId={corporation.corporation_id}
                memberHash={members[0]}
              />
            </Disclosure>
          </EntityRow>
        );
      })}
    </Stack>
  );
}
