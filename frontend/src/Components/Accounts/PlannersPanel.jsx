import { Avatar, Stack, Typography } from "@mui/material";

import useUsersStore from "../../Zustand/usersStore";
import {
  plannerDisplayName,
  usePlannersQuery,
} from "../../Hooks/React Query/planners";
import {
  entityIDFromOwnerHandle,
  splitOwnerHandle,
} from "../../Functions/Helper/ownerHandle";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import EntityRow from "../../Styled Components/Paper/EntityRow";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";
import ActionMenu from "../../Styled Components/Menu/ActionMenu";
import StatusChip, {
  STATUS_TONE,
} from "../../Styled Components/Chip/statusChip";
import { useMainCharacter } from "./useMainCharacter";

/**
 * How the account came to be in a planner, named for the reader rather than for the union branch.
 *
 * A membership carries no role, so this is what the row can honestly say: why the account is here,
 * not what it may do once it is.
 */
const JOIN_METHOD = {
  owner: "owner",
  invite: "invited",
  entityMember: "member",
  accessList: "access list",
};

/**
 * What each inert action waits for — which is not the same thing for both.
 *
 * Inviting needs an API surface over the invite records the server already keeps. Leaving needs the
 * revocation path, which drops the planner's owner key from the account's grants ceiling; that is
 * separate, larger work. Telling a reader that leaving waits on the invite API would read as
 * satisfied the day the invite API ships, with nothing behind the control.
 */
const AWAITING_INVITE_API = "Waiting on an invite API";
const AWAITING_REVOCATION =
  "Waiting on the path that drops a planner's access when a member leaves";

/**
 * The planners an account may work in, and how it got into each.
 *
 * Read-only against the listing the header's switcher already uses. Choosing which planner to work
 * in stays with that switcher: this section is for seeing and managing them.
 */
export function PlannersPanel() {
  const { data: planners, isLoading, isError } = usePlannersQuery();
  const activeOwner = useUsersStore((state) =>
    state.activePlanner.actions.getActivePlannerOwner(),
  );
  const { character: mainCharacter } = useMainCharacter();

  if (isLoading || isError || !planners?.length) return null;

  return (
    <SectionPanel
      title="Planners"
      subtitle="Membership is what grants access. The chip says how this account got into each one."
      componentName="Planners"
    >
      <Stack spacing={1} sx={{ width: "100%" }}>
        {planners.map((planner) => {
          const { kind } = splitOwnerHandle(planner.owner);
          const entityId = entityIDFromOwnerHandle(planner.owner);

          return (
            <EntityRow
              key={planner.owner}
              selected={planner.owner === activeOwner}
              avatar={plannerAvatar(
                kind,
                entityId,
                mainCharacter,
                plannerDisplayName(planner),
              )}
              name={plannerDisplayName(planner)}
              context={
                <Typography variant="body2" color="text.secondary" noWrap>
                  {kind}
                </Typography>
              }
              status={
                <>
                  <StatusChip
                    label={
                      JOIN_METHOD[planner.joinMethod] ?? planner.joinMethod
                    }
                    tone={
                      planner.joinMethod === "owner"
                        ? STATUS_TONE.FACT
                        : STATUS_TONE.NEUTRAL
                    }
                  />
                  {planner.owner === activeOwner && (
                    <StatusChip label="active" tone={STATUS_TONE.GOOD} />
                  )}
                </>
              }
              actions={
                <ActionMenu
                  label={`${plannerDisplayName(planner)} actions`}
                  items={managementActions(kind, planner.joinMethod)}
                />
              }
            />
          );
        })}
      </Stack>
    </SectionPanel>
  );
}

/**
 * What can be done to a planner from this row.
 *
 * **Only a custom planner has any of it.** Every kind of planner keeps membership rows, and access
 * is the same question for all of them — does this account hold a row. What differs is whether the
 * provider that maintains those rows offers any way to *change* them: a custom planner's does
 * (invite, accept, remove), and an ESI-sourced one refuses roster mutation with a 403, because you
 * cannot kick somebody out of their own corporation. An account's own planner has one member who
 * cannot leave it.
 *
 * @param {string} kind - the owner handle's kind
 * @param {string} joinMethod
 * @returns {Array<object>} items for `ActionMenu`, empty when the row manages nothing
 */
function managementActions(kind, joinMethod) {
  if (kind !== "planner") return [];

  return [
    {
      label: "Invite a character",
      disabled: true,
      disabledReason: AWAITING_INVITE_API,
    },
    {
      label: "See members",
      disabled: true,
      disabledReason: "No endpoint lists a planner's members",
    },
    // An account cannot leave the planner it owns.
    ...(joinMethod === "owner"
      ? []
      : [
          {
            label: "Leave planner",
            disabled: true,
            disabledReason: AWAITING_REVOCATION,
            destructive: true,
          },
        ]),
  ];
}

/**
 * EVE's own picture for whoever owns the planner.
 *
 * An account's own planner has no entity behind it, so it wears the character the account signs in
 * as — the same face the switcher shows for it. A custom planner has no entity and is not the
 * account's own, so it wears nothing.
 *
 * @param {string} kind - the owner handle's kind
 * @param {number} entityId
 * @param {object} [mainCharacter]
 * @param {string} name - what the planner is called, for the picture's alt text
 * @returns {React.ReactNode}
 */
function plannerAvatar(kind, entityId, mainCharacter, name) {
  if (kind === "account") {
    return (
      <EveImageAvatar
        alt={`${mainCharacter?.CharacterName ?? "Your"} portrait`}
        character={mainCharacter?.CharacterID}
        size={42}
        variant="rounded"
      />
    );
  }
  if (kind === "corporation") {
    return (
      <EveImageAvatar
        alt={`${name} logo`}
        corporation={entityId}
        size={42}
        variant="rounded"
      />
    );
  }
  if (kind === "alliance") {
    return (
      <EveImageAvatar
        alt={`${name} logo`}
        alliance={entityId}
        size={42}
        variant="rounded"
      />
    );
  }
  // A custom planner belongs to no EVE entity, so there is no artwork to ask for and the blank
  // avatar is the honest answer rather than somebody's face standing in for it.
  return <Avatar alt="" variant="rounded" sx={{ width: 42, height: 42 }} />;
}
