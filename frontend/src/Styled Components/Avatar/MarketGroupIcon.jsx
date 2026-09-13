import { Avatar } from "@mui/material";
import CategoryIcon from "@mui/icons-material/Category";

import { eveImageSize } from "../../Functions/Shared/eveOwner";

/**
 * The picture a market group is recognised by.
 *
 * A group's own icon in EVE's data names a file inside the game client, which
 * nothing can serve — the image server carries types, characters and
 * corporations and nothing else. So a group borrows one of its own items and
 * shows that, which is a picture of the same thing either way: Minerals is
 * Tritanium.
 *
 * Where a whole branch is obsolete and holds no published item there is nothing
 * to borrow, and a plain glyph stands in. `Avatar` renders its children when the
 * image fails, so a type the server has no art for lands there too.
 *
 * @param {object} props
 * @param {number} [props.typeID] - the item this group is recognised by
 * @param {number} [props.size=24] - drawn size in pixels
 */
export default function MarketGroupIcon({ typeID, size = 24, ...rest }) {
  return (
    <Avatar
      src={
        typeID
          ? `https://images.evetech.net/types/${typeID}/icon?size=${eveImageSize(size * 2)}`
          : undefined
      }
      alt=""
      variant="square"
      sx={{ height: size, width: size, backgroundColor: "transparent" }}
      {...rest}
    >
      <CategoryIcon sx={{ fontSize: size, color: "text.disabled" }} />
    </Avatar>
  );
}
