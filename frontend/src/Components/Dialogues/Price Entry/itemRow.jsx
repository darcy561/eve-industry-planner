import {
  Avatar,
  Checkbox,
  Grid,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import uuid from "react-uuid";
import GLOBAL_CONFIG from "../../../global-config-app";
import useUsersStore from "../../../Zustand/usersStore";
import { numberToShortText, formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import { STANDARD_TEXT_FORMAT, SMALL_TEXT_FORMAT } from "../../../Context/defaultValues";
const { PRIMARY_THEME } = GLOBAL_CONFIG;

export function ItemPriceRow({
  item,
  index,
  displayOrder,
  displayMarket,
  priceEntryListData,
  setPriceEntryListData,
  clearUnconfirmedTrigger,
}) {
  const marketData = useUsersStore((state) => state.worldData.marketData);
  const { findMarketData } = useUsersStore.getState().worldData.actions;

  const materialPrice = findMarketData(item.typeID);
  const rawDefault = materialPrice?.[displayMarket]?.[displayOrder];
  const defaultPrice = Number.isFinite(Number(rawDefault)) ? Number(rawDefault) : 0;

  const lastListingKeyRef = useRef(null);
  const lastSyncedDefaultRef = useRef(null);

  // item.priceEntries only contains confirmed entries
  // Unconfirmed entries are held in component state only
  const confirmedEntries = item.priceEntries || [];
  
  // Initialize unconfirmed entries - start with one entry if no confirmed entries exist
  const getInitialUnconfirmedEntries = () => {
    const confirmedQty = confirmedEntries.reduce((sum, e) => sum + (e.itemCount || 0), 0);
    const remainingQty = item.remainingQuantity - confirmedQty;
    
    if (remainingQty > 0) {
      const initialEntry = itemPriceEntryFactory(
        item.typeID,
        remainingQty,
        defaultPrice
      );
      return [initialEntry];
    }
    return [];
  };

  const [unconfirmedEntries, setUnconfirmedEntries] = useState(getInitialUnconfirmedEntries());

  // Sync unconfirmed row prices when hub/listing changes, or when market data fills in / updates
  // (without clobbering a value the user edited away from the last synced default).
  useEffect(() => {
    const { findMarketData: findMd } = useUsersStore.getState().worldData.actions;
    const mp = findMd(item.typeID);
    const raw = mp?.[displayMarket]?.[displayOrder];
    const nextDefault = Number(raw);
    if (!Number.isFinite(nextDefault)) {
      return;
    }

    const listingKey = `${displayMarket}:${displayOrder}`;
    const listingChanged =
      lastListingKeyRef.current === null || lastListingKeyRef.current !== listingKey;
    lastListingKeyRef.current = listingKey;

    const priorDefault = lastSyncedDefaultRef.current;

    setUnconfirmedEntries((prev) => {
      if (prev.length === 0) return prev;

      let changed = false;
      const next = prev.map((entry) => {
        if (listingChanged) {
          changed = true;
          return { ...entry, itemCost: nextDefault };
        }
        if (entry.itemCost == null || Number.isNaN(Number(entry.itemCost))) {
          changed = true;
          return { ...entry, itemCost: nextDefault };
        }
        if (
          priorDefault != null &&
          Number.isFinite(Number(priorDefault)) &&
          Math.abs(Number(entry.itemCost) - Number(priorDefault)) < 1e-6
        ) {
          if (Math.abs(Number(entry.itemCost) - Number(nextDefault)) >= 1e-6) {
            changed = true;
            return { ...entry, itemCost: nextDefault };
          }
        }
        return entry;
      });
      return changed ? next : prev;
    });

    lastSyncedDefaultRef.current = nextDefault;
  }, [marketData, displayMarket, displayOrder, item.typeID]);

  useEffect(() => {
    // When confirmed entries change externally, update unconfirmed if needed
    const confirmedQty = (item.priceEntries || []).reduce((sum, e) => sum + (e.itemCount || 0), 0);
    const remainingQty = item.remainingQuantity - confirmedQty;
    
    // If we have remaining quantity but no unconfirmed entries, create one
    if (remainingQty > 0 && unconfirmedEntries.length === 0) {
      const initialEntry = itemPriceEntryFactory(
        item.typeID,
        remainingQty,
        defaultPrice
      );
      setUnconfirmedEntries([initialEntry]);
    } else if (remainingQty <= 0 && unconfirmedEntries.length > 0) {
      // If no remaining quantity, clear unconfirmed entries
      setUnconfirmedEntries([]);
    }
  }, [item.priceEntries, item.remainingQuantity]);

  // Clear unconfirmed entries when Confirm All is triggered
  useEffect(() => {
    if (clearUnconfirmedTrigger > 0) {
      const confirmedQty = (item.priceEntries || []).reduce((sum, e) => sum + (e.itemCount || 0), 0);
      const remainingQty = item.remainingQuantity - confirmedQty;
      
      // Clear unconfirmed entries since Confirm All creates new confirmed entries
      if (remainingQty <= 0) {
        setUnconfirmedEntries([]);
      } else {
        // If there's still remaining quantity, replace unconfirmed with a new entry for remaining
        const newEntry = itemPriceEntryFactory(
          item.typeID,
          remainingQty,
          defaultPrice
        );
        setUnconfirmedEntries([newEntry]);
      }
    }
  }, [clearUnconfirmedTrigger, item.priceEntries, item.remainingQuantity, item.typeID, defaultPrice]);

  // Clipboard import is now handled in parent component and added directly to confirmed entries
  // No need for this useEffect anymore

  const updateConfirmedEntries = (newConfirmedEntries) => {
    let newList = [...priceEntryListData.list];
    newList[index].priceEntries = newConfirmedEntries;
    setPriceEntryListData((prev) => ({
      ...prev,
      list: newList,
    }));
  };


  const updateUnconfirmedEntry = (entryId, field, value) => {
    const entryToUpdate = unconfirmedEntries.find((e) => e.id === entryId);
    if (!entryToUpdate) return;

    // Allow 0 as a valid value
    // If value is empty string, store as empty string (for clearing the field)
    // Otherwise, convert to number (including 0)
    let newValue;
    if (value === "" || value === null || value === undefined) {
      newValue = "";
    } else {
      const numValue = Number(value);
      // Explicitly allow 0 - isNaN(0) is false, so 0 will be stored
      newValue = isNaN(numValue) ? "" : numValue;
    }
    
    const newEntry = { ...entryToUpdate, [field]: newValue };
    const newEntries = unconfirmedEntries.map((e) =>
      e.id === entryId ? newEntry : e
    );
    setUnconfirmedEntries(newEntries);
  };

  const confirmEntry = (entryId) => {
    const entryToConfirm = unconfirmedEntries.find((e) => e.id === entryId);
    // Allow 0 values - only prevent negative values or null/undefined
    if (!entryToConfirm || 
        entryToConfirm.itemCount == null || entryToConfirm.itemCount < 0 || 
        entryToConfirm.itemCost == null || entryToConfirm.itemCost < 0) {
      return;
    }

    // Move entry from unconfirmed to confirmed
    const newUnconfirmed = unconfirmedEntries.filter((e) => e.id !== entryId);
    const newConfirmed = [...confirmedEntries, entryToConfirm];
    
    // Calculate remaining quantity after this confirmation
    const newConfirmedQty = newConfirmed.reduce((sum, e) => sum + (e.itemCount || 0), 0);
    const newRemainingQty = item.remainingQuantity - newConfirmedQty;
    
    // Automatically create a new unconfirmed entry if there's remaining quantity
    if (newRemainingQty > 0) {
      const newEntry = itemPriceEntryFactory(
        item.typeID,
        newRemainingQty,
        defaultPrice
      );
      newUnconfirmed.push(newEntry);
    }
    
    setUnconfirmedEntries(newUnconfirmed);
    updateConfirmedEntries(newConfirmed);
  };

  const unconfirmEntry = (entryId) => {
    // Delete the confirmed entry
    const newConfirmed = confirmedEntries.filter((e) => e.id !== entryId);
    updateConfirmedEntries(newConfirmed);
  };

  // Calculate remaining quantity (only counting confirmed entries)
  const confirmedQuantity = confirmedEntries.reduce((sum, e) => sum + (e.itemCount || 0), 0);
  const remainingQuantity = item.remainingQuantity - confirmedQuantity;

  return (
    <Grid
      key={item.typeID}
      container
      spacing={1}
      sx={{ marginBottom: 2, paddingBottom: 2, borderBottom: "1px solid rgba(0,0,0,0.12)" }}
      size={12}>
      {/* Item Header */}
      <Grid container size={12} alignItems="center" sx={{ marginBottom: 1 }}>
        <Grid
          sx={{
            display: { xs: "none", sm: "block" },
            paddingRight: "5px",
          }}
          align="center"
          size={{ sm: 1 }}>
          <Avatar
            src={`https://images.evetech.net/types/${item.typeID}/icon?size=32`}
            alt={item.name}
            variant="square"
            sx={{ height: 32, width: 32 }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Typography sx={{ typography: { xs: "body2", sm: "body1" } }}>
            {item.name}
          </Typography>
          <Tooltip
            title={`Total Needed: ${numberToShortText(item.totalQuantity)} | Remaining: ${numberToShortText(remainingQuantity)}`}
            arrow
            placement="top"
          > 
          <Typography sx={{ typography: SMALL_TEXT_FORMAT }} color="text.secondary">
            Total Needed: { formatNumberForLocale(item.totalQuantity, { max: 0 })} | Remaining: {formatNumberForLocale(remainingQuantity, { max: 0 })}
          </Typography>
          </Tooltip>
        </Grid>
      </Grid>

      {/* Confirmed Price Entries */}
      {confirmedEntries.map((entry) => (
        <Grid
          key={entry.id}
          container
          size={12}
          alignItems="center"
          spacing={1} 
          sx={{ marginLeft: { xs: 0, sm: "40px" } }}
        >
          <Grid size={{ xs: 3, sm: 3 }}>
            <Tooltip
              title={numberToShortText(entry.itemCount || 0)}
              arrow
              placement="top"
            >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Qty: {formatNumberForLocale(entry.itemCount || 0, { max: 0 })}
            </Typography>
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 4, sm: 3 }}>
            <Tooltip
              title={numberToShortText(entry.itemCost || 0)}
              arrow
              placement="top"
            >
              <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                Price: {formatNumberForLocale(entry.itemCost || 0)}
              </Typography>
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 2, sm: 3 }}>
            <Tooltip
              title={numberToShortText((entry.itemCount || 0) * (entry.itemCost || 0))}
              arrow
              placement="top"
            >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} color="text.secondary">
              Total: {formatNumberForLocale((entry.itemCount || 0) * (entry.itemCost || 0))}
            </Typography>
            </Tooltip>
          </Grid>
          <Grid 
            size={{ xs: 3, sm: 3 }} 
            sx={{ display: "flex", justifyContent: "flex-end" }}
          >
            <Tooltip title="Click to delete" arrow>
              <Checkbox
                checked={true}
                size="small"
                onChange={() => unconfirmEntry(entry.id)}
                sx={{
                  color: (theme) =>
                    theme.palette.mode === PRIMARY_THEME
                      ? theme.palette.primary.main
                      : theme.palette.secondary.main,
                }}
              />
            </Tooltip>
          </Grid>
        </Grid>
      ))}

      {/* Unconfirmed Price Entries */}
      {unconfirmedEntries.map((entry) => (
        <Grid
          key={entry.id}
          container
          size={12}
          alignItems="center"
          spacing={1}
          sx={{ marginLeft: { xs: 0, sm: "40px" } }}
        >
          <Grid size={{ xs: 3, sm: 3 }}>
            <Tooltip
              title={numberToShortText(entry.itemCount)}
              arrow
              placement="top"
            >
              <TextField
                size="small"
                variant="standard"
                type="number"
                label="Quantity"
                value={entry.itemCount != null ? entry.itemCount : ""}
                sx={{
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                    {
                      display: "none",
                    },
                }}
                onChange={(e) =>
                  updateUnconfirmedEntry(entry.id, "itemCount", e.target.value)
                }
                slotProps={{
                  htmlInput: { step: "1", min: "0" },
                }}
              />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 4, sm: 3 }}>
            <Tooltip
              title={numberToShortText(entry.itemCost || 0)}
              arrow
              placement="top"
            >
              <TextField
                size="small"
                variant="standard"
                type="number"
                label="Price"
                value={entry.itemCost != null ? entry.itemCost : ""}
                sx={{
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                    {
                      display: "none",
                    },
                }}
                onChange={(e) =>
                  updateUnconfirmedEntry(entry.id, "itemCost", e.target.value)
                }
                slotProps={{
                  htmlInput: { step: "0.01", min: "0" },
                }}
              />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 2, sm: 3 }}>
            <Tooltip
              title={numberToShortText((entry.itemCount || 0) * (entry.itemCost || 0))}
              arrow
              placement="top"
            >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }} color="text.secondary">
              Total: {formatNumberForLocale((entry.itemCount || 0) * (entry.itemCost || 0))}
            </Typography>
            </Tooltip>
          </Grid>
          <Grid 
            size={{ xs: 3, sm: 3 }} 
            sx={{ display: "flex", justifyContent: "flex-end" }}
          >
            <Tooltip title="Click to confirm" arrow>
              <Checkbox
                checked={false}
                size="small"
                onChange={() => confirmEntry(entry.id)}
                disabled={entry.itemCount == null || entry.itemCount < 0 || entry.itemCost == null || entry.itemCost < 0}
                sx={{
                  color: (theme) =>
                    theme.palette.mode === PRIMARY_THEME
                      ? theme.palette.primary.main
                      : theme.palette.secondary.main,
                }}
              />
            </Tooltip>
          </Grid>
        </Grid>
      ))}

    </Grid>
  );
}

export function itemPriceEntryFactory(typeID, itemCount, itemCost) {
  return {
    typeID,
    id: uuid(),
    itemCount,
    itemCost,
  };
}
