import { useCallback, useMemo, useRef } from "react";
import { Box, Grid, Typography, useMediaQuery } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import AssetTreeRow, { assetRowHeight } from "./assetTreeRow";
import flattenAssetTree from "../../../Functions/Assets/flattenAssetTree";
import { useItemList } from "../../../Hooks/Static/useItems";

/**
 * The asset tree, however many rows deep it goes.
 *
 * Only the rows in view are mounted, and each kind states its own height rather than being
 * measured: a location header, a hangar division and a stack are all different heights.
 *
 * @param {{
 *   locations: Array<Object>,
 *   byItemId: Map<number, Object>,
 *   containerNames: Map<number, {name: string}>,
 *   excludeItemIds?: Set<number>,
 *   compartments?: Array<{assetLocationRef: string, name: string}>,
 *   expanded: Set<string>,
 *   onToggle: (key: string) => void,
 *   search?: string
 * }} props
 */
export default function AssetTree({
  locations,
  byItemId,
  containerNames,
  excludeItemIds,
  compartments,
  expanded,
  onToggle,
  search,
}) {
  const listRef = useRef(null);
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  // Read once for the whole list rather than per row: every row names and pictures what it holds
  // from the same records, and the list is virtualised so a row mounts and unmounts as it scrolls.
  const { records: itemRecords } = useItemList();

  const rows = useMemo(
    () =>
      flattenAssetTree({
        locations,
        expanded,
        byItemId,
        itemRecords,
        compartments,
        excludeItemIds,
        containerNames,
        search,
      }),
    [
      locations,
      expanded,
      byItemId,
      itemRecords,
      compartments,
      excludeItemIds,
      containerNames,
      search,
    ],
  );

  // Measured against the list's own box rather than the page, so where the list
  // sits on the page does not come into it.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: useCallback(
      (index) => assetRowHeight(rows[index].kind, deviceNotMobile),
      [rows, deviceNotMobile],
    ),
    overscan: 8,
    getItemKey: useCallback((index) => rows[index].key, [rows]),
  });

  if (rows.length === 0) {
    return (
      <Grid container align="center" size={12} sx={{ paddingY: 4 }}>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ width: "100%" }}
        >
          {search?.trim()
            ? "Nothing here matches that"
            : "Nothing held in this view"}
        </Typography>
      </Grid>
    );
  }

  return (
    <Box
      ref={listRef}
      sx={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          return (
            <div
              key={item.key}
              data-index={item.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${item.size}px`,
                transform: `translateY(${item.start}px)`,
              }}
            >
              <AssetTreeRow
                row={row}
                height={item.size}
                expanded={expanded.has(row.key)}
                onToggle={() => onToggle(row.key)}
                itemRecords={itemRecords}
                containerNames={containerNames}
              />
            </div>
          );
        })}
      </div>
    </Box>
  );
}
