import { ownerImageUrl, ownerName } from "../../Functions/Shared/eveOwner";
import EveImageAvatar from "./EveImageAvatar";

/**
 * Whoever holds a thing, as EVE's own portrait or corporation logo.
 *
 * @param {{owner: import("../../Functions/Shared/ownerKind").EveOwner|null, size?: number}} props
 */
export default function OwnerAvatar({ owner, size = 24, ...rest }) {
  const name = ownerName(owner);

  return (
    <EveImageAvatar
      src={ownerImageUrl(owner, size * 2)}
      alt={name}
      title={name || undefined}
      size={size}
      {...rest}
    />
  );
}
