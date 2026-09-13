import {
  Avatar,
  Box,
  IconButton,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InsetSurface from "../../../Styled Components/Paper/InsetSurface";
import { ASSET_ROW } from "../../../Functions/Assets/flattenAssetTree";
import {
  assetImageUrl,
  assetName,
} from "../../../Functions/Assets/assetPresentation";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import { Figure } from "../../../Styled Components/Typography/figures";

/** One level of nesting, as an indent rather than a margin that narrows the row. */
const INDENT = 16;

/**
 * How tall each kind of row is, stated rather than measured: every row holds one
 * line that never wraps.
 *
 * The floor is the expander, not the text — a small icon button is 30px, taller
 * than any line of type here, and all but the emptiest location rows carry one.
 * A row that renders taller than it claims sits over the one below it, because
 * the virtualiser positions by the stated height and nothing clips the rest.
 */
const ROW_HEIGHT = Object.freeze({
  // The expander, plus each kind's own padding, border and margin.
  [ASSET_ROW.LOCATION]: { narrow: 44, wide: 44 },
  [ASSET_ROW.COMPARTMENT]: { narrow: 36, wide: 36 },
  [ASSET_ROW.ITEM]: { narrow: 36, wide: 40 },
});

/**
 * @param {string} kind - see {@link ASSET_ROW}
 * @param {boolean} deviceNotMobile
 * @returns {number} height in pixels
 */
export function assetRowHeight(kind, deviceNotMobile) {
  const heights = ROW_HEIGHT[kind] ?? ROW_HEIGHT[ASSET_ROW.ITEM];
  return deviceNotMobile ? heights.wide : heights.narrow;
}

/** Stacks and quantities are whole things; the formatter's two decimals are for ISK. */
const WHOLE = { max: 0 };

/**
 * One row of the asset tree: a location, a corporation hangar division, a container, or a stack.
 *
 * Depth is drawn as guide rules to the left of the row rather than as a margin on it, so the
 * quantity stays in the same column however deep the row sits.
 *
 * @param {{row: import("../../../Functions/Assets/flattenAssetTree").AssetTreeRow, height: number, expanded: boolean, onToggle: Function, itemRecords: Object, containerNames: Map}} props
 */
export default function AssetTreeRow({
  row,
  height,
  expanded,
  onToggle,
  itemRecords,
  containerNames,
}) {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const isLocation = row.kind === ASSET_ROW.LOCATION;

  if (isLocation || row.kind === ASSET_ROW.COMPARTMENT) {
    const Surface = isLocation ? InsetSurface : Box;

    return (
      <Row depth={row.depth} height={height}>
        <Surface
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            width: "100%",
            padding: 0,
            paddingRight: 1,
            paddingY: isLocation ? 0.5 : 0,
            marginY: 0.25,
          }}
        >
          <Expander
            expandable={row.expandable}
            expanded={expanded}
            onToggle={onToggle}
            name={row.context ? `${row.label}, ${row.context}` : row.label}
          />
          <Typography
            noWrap
            sx={{
              flex: 1,
              minWidth: 0,
              typography: isLocation
                ? deviceNotMobile
                  ? "body1"
                  : "body2"
                : "body2",
              fontWeight: isLocation ? 600 : 500,
            }}
          >
            {row.label}
          </Typography>
          {/* A place holding nothing says so, rather than opening onto nothing. */}
          <Typography variant="caption" color="text.secondary">
            {row.count > 0 ? formatNumberForLocale(row.count, WHOLE) : "Empty"}
          </Typography>
        </Surface>
      </Row>
    );
  }

  const { node } = row;
  const itemName = assetName(node, itemRecords, containerNames);

  return (
    <Row depth={row.depth} height={height}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: "100%",
          paddingRight: 1,
          paddingY: 0.25,
          borderRadius: 1,
          "&:hover": {
            backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
          },
        }}
      >
        <Expander
          expandable={row.expandable}
          expanded={expanded}
          onToggle={onToggle}
          name={itemName}
        />
        <Avatar
          src={assetImageUrl(node, itemRecords)}
          alt=""
          variant="square"
          sx={{
            height: deviceNotMobile ? 32 : 24,
            width: deviceNotMobile ? 32 : 24,
          }}
        />
        <Typography
          noWrap
          sx={{
            flex: 1,
            minWidth: 0,
            typography: deviceNotMobile ? "body2" : "caption",
          }}
        >
          {itemName}
        </Typography>
        {!row.expandable && (
          <Figure
            variant={deviceNotMobile ? "body2" : "caption"}
            formatOptions={WHOLE}
          >
            {node.quantity}
          </Figure>
        )}
      </Box>
    </Row>
  );
}

/**
 * The row's place in the tree, drawn as one guide rule per level it sits under.
 */
function Row({ depth, height, children }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        width: "100%",
        height: `${height}px`,
        boxSizing: "border-box",
      }}
    >
      {Array.from({ length: depth }, (unused, level) => (
        <Box
          key={level}
          sx={{
            width: `${INDENT}px`,
            flexShrink: 0,
            borderLeft: (theme) =>
              `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
          }}
        />
      ))}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * Always to the left of what it opens, and holding its place when there is nothing to open, so the
 * rows below it stay in one column.
 */
function Expander({ expandable, expanded, onToggle, name }) {
  if (!expandable) return <Box sx={{ width: 34, flexShrink: 0 }} />;

  return (
    <IconButton
      size="small"
      onClick={onToggle}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
      sx={{ flexShrink: 0 }}
    >
      {expanded ? (
        <ExpandMoreIcon fontSize="small" />
      ) : (
        <ChevronRightIcon fontSize="small" />
      )}
    </IconButton>
  );
}
