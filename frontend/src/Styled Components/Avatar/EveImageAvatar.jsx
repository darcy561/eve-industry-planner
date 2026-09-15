import { Avatar } from "@mui/material";

import {
  characterImageUrl,
  corporationImageUrl,
  EVE_DEFAULT_OWNER_ID,
  TYPE_IMAGE,
  typeImageUrl,
} from "../../Functions/Shared/eveImage";

/**
 * The largest the picture is ever drawn, which is the size worth fetching.
 *
 * @param {number|Object<string, number>} size
 * @returns {number}
 */
function largestDrawn(size) {
  return typeof size === "number" ? size : Math.max(...Object.values(size));
}

/**
 * A picture from EVE's image server.
 *
 * Name the subject — an item and which of its pictures, a character, a corporation — or pass `src`
 * for a URL something else resolved, which is how the owner and asset helpers reach here. The
 * request is made at twice the drawn size, so a high-density screen has pixels to use, and a
 * responsive `size` is fetched at the largest breakpoint it is ever drawn at.
 *
 * It is a MUI `Avatar`, so it keeps `Avatar`'s own styling and composes with the MUI parents that
 * style a child by recognising one — `AvatarGroup`'s overlap and ring, `Chip`'s avatar slot, `Badge`.
 *
 * A character or corporation the app holds no id for is asked for under {@link EVE_DEFAULT_OWNER_ID},
 * so the picture is EVE's own default portrait or logo rather than an empty frame. The server has no
 * equivalent for an item.
 *
 * @param {object} props
 * @param {number|string} [props.type] - an item, whose picture {@link props.variation} names
 * @param {string} [props.variation=TYPE_IMAGE.ICON] - see {@link TYPE_IMAGE}
 * @param {number|string} [props.character]
 * @param {number|string} [props.corporation]
 * @param {string} [props.src] - a URL already resolved; use instead of the subject props
 * @param {number|Object<string, number>} [props.size=32] - drawn pixels, or an sx breakpoint object
 * @param {"circular"|"rounded"|"square"} [props.variant="circular"] - MUI `Avatar`'s own default
 * @param {string} [props.alt=""]
 * @param {object} [props.sx]
 */
export default function EveImageAvatar(props) {
  const {
    type,
    variation = TYPE_IMAGE.ICON,
    character,
    corporation,
    src,
    size = 32,
    variant = "circular",
    alt = "",
    sx,
    ...rest
  } = props;

  // Which subject prop was passed, not what it holds: an id the app has not got yet is still a
  // character, and that is what says whose default picture to ask for in its place.
  const isCharacter = "character" in props;
  const isCorporation = "corporation" in props;

  const pixels = largestDrawn(size) * 2;
  const url =
    src ??
    (isCharacter
      ? characterImageUrl(character ?? EVE_DEFAULT_OWNER_ID, pixels)
      : isCorporation
        ? corporationImageUrl(corporation ?? EVE_DEFAULT_OWNER_ID, pixels)
        : typeImageUrl(type, variation, pixels));

  return (
    <Avatar
      src={url}
      alt={alt}
      variant={variant}
      slotProps={{ img: { loading: "lazy", decoding: "async" } }}
      sx={[{ width: size, height: size }, ...(Array.isArray(sx) ? sx : [sx])]}
      {...rest}
    />
  );
}
