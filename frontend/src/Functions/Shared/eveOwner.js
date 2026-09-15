import useUsersStore from "../../Zustand/usersStore";
import { characterImageUrl, corporationImageUrl } from "./eveImage";
import { OWNER_KIND } from "./ownerKind";

/**
 * What the account calls an owner.
 *
 * @param {import("./ownerKind").EveOwner|null} [owner]
 * @returns {string} empty when there is no owner to name
 */
export function ownerName(owner) {
  if (!owner?.id) return "";

  const { actions } = useUsersStore.getState().account;

  return owner.kind === OWNER_KIND.CORPORATION
    ? (actions.getCorporation(owner.id)?.corporationName ??
        "Unknown corporation")
    : (actions.findCharacterByHash(owner.id)?.CharacterName ??
        "Unknown character");
}

/**
 * EVE's own portrait or logo for an owner.
 *
 * A corporation is addressed by the id the image server wants; a character is held by hash, which
 * has to be resolved to its id first.
 *
 * @param {import("./ownerKind").EveOwner|null} [owner]
 * @param {number} [pixels] - how large it will be drawn
 * @returns {string|undefined} undefined when there is no image to show
 */
export function ownerImageUrl(owner, pixels = 32) {
  if (!owner?.id) return undefined;

  if (owner.kind === OWNER_KIND.CORPORATION) {
    return corporationImageUrl(owner.id, pixels);
  }

  const character = useUsersStore
    .getState()
    .account.actions.findCharacterByHash(owner.id);

  return characterImageUrl(character?.CharacterID, pixels);
}
