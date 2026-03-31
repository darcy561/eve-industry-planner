import { useMemo, useState, useEffect } from "react";
import {
  Avatar,
  Box,
  Button,
  Divider,
  Fade,
  Grid,
  Tooltip,
  Typography,
  CircularProgress,
  useMediaQuery,
  IconButton,
  Menu,
  MenuItem,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import {
  LARGE_TEXT_FORMAT,
  reprocessingItemTypes,
  STANDARD_TEXT_FORMAT,
} from "../../Context/defaultValues";
import { useCachedData } from "../../Hooks/useCachedData";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import MineralCard from "./Components/MineralCard";
import MaterialPopoverIconButtons from "../../Styled Components/Popover/iconButtons";
import ReprocessingSettingsPanel from "./reprocessingSettingsPanel";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";
import writeTextToClipboard from "../../Functions/Clipboard/writeTextToClipboard";

export function AdvancedMineralOutput(props) {
  const { pageState, pageActions } = props;
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));
  const [menuAnchors, setMenuAnchors] = useState({});
  const [clipboardAccessible, setClipboardAccessible] = useState(true);
  const findMarketData =
    useUsersStore.getState().worldData.actions.findMarketData;
  const { data: fullItemList, isLoading } = useCachedData(
    CACHED_DATA_FILES.FULL_ITEM_LIST
  );

  // Check clipboard permissions
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        // Test if we can actually write to clipboard
        await navigator.clipboard.writeText("test");
        setClipboardAccessible(true);
      } catch (error) {
        setClipboardAccessible(false);
      }
    };
    checkClipboard();
  }, []);

  const handleMenuClick = (event, itemId) => {
    setMenuAnchors((prev) => ({
      ...prev,
      [itemId]: event.currentTarget,
    }));
  };

  const handleMenuClose = (itemId) => {
    setMenuAnchors((prev) => ({
      ...prev,
      [itemId]: null,
    }));
  };

  const handleExcludeOre = (itemId) => {
    pageActions.addOreIDToBeIgnored(itemId);
    handleMenuClose(itemId);
  };

  const handleCopyOreData = async () => {
    if (!fullItemList) return;

    let copyText = "";
    pageState.reprocessingObjects.forEach((item) => {
      if (item.batchSize > item.totalQuantity) return;
      const oreName = fullItemList[item.id]?.name ?? "Unknown Item";
      copyText += `${oreName} ${item.totalQuantity}\n`;
    });

    await writeTextToClipboard(copyText);
  };

  const handleRequestClipboardAccess = async () => {
    try {
      console.log("Requesting clipboard access...");
      // Try to copy the data - this will either work or fail
      await handleCopyOreData();
      console.log("Copy successful, updating state to accessible");
      // If successful, update the state
      setClipboardAccessible(true);
    } catch (error) {
      console.error("Failed to request clipboard permission:", error);
      // Permission was denied, keep the button in request state
      setClipboardAccessible(false);
    }
  };

  const totalValue = useMemo(() => {
    if (!fullItemList) return 0;
    if (pageState.toMinerals) {
      // When converting to minerals, calculate value of processed minerals
      return pageState.processedInput.reduce((acc, item) => {
        if (item.quantity === 0) return acc;
        const itemPriceObject = findMarketData(item.id);
        const unitPrice =
          itemPriceObject[pageState.marketLocation][pageState.marketListing] ??
          0;
        return acc + unitPrice * item.quantity;
      }, 0);
    } else {
      // When converting from minerals, calculate value of minerals that will be produced
      return pageState.reprocessingObjects.reduce((acc, item) => {
        if (item.batchSize > item.totalQuantity) return acc;
        let itemTotal = 0;
        for (const [mineralId, quantity] of Object.entries(
          item.reprocessedMaterials
        )) {
          const itemPriceObject = findMarketData(mineralId);
          const unitPrice =
            itemPriceObject[pageState.marketLocation][
              pageState.marketListing
            ] ?? 0;
          const totalQuantity =
            item.itemType === reprocessingItemTypes.gas
              ? quantity
              : quantity * (item.reprocessableQuantity / item.batchSize);
          itemTotal += unitPrice * totalQuantity;
        }
        return acc + itemTotal;
      }, 0);
    }
  }, [
    pageState.processedInput,
    pageState.reprocessingObjects,
    pageState.marketLocation,
    pageState.marketListing,
    pageState.toMinerals,
    fullItemList,
  ]);

  const totalUnreprocessedValue = useMemo(() => {
    if (!fullItemList) return 0;
    return pageState.reprocessingObjects.reduce((acc, item) => {
      if (item.batchSize > item.totalQuantity) return acc;
      const itemPriceObject = findMarketData(item.id);
      const unitPrice =
        itemPriceObject[pageState.marketLocation][pageState.marketListing] ?? 0;
      return acc + unitPrice * item.totalQuantity;
    }, 0);
  }, [
    pageState.reprocessingObjects,
    pageState.marketLocation,
    pageState.marketListing,
    fullItemList,
  ]);

  // Calculate value of excess minerals that will be sold
  const excessMineralsValue = useMemo(() => {
    if (
      !fullItemList ||
      pageState.toMinerals ||
      !pageState.reprocessingCalculationSettings.sellExcessMineralTypes
    )
      return 0;

    return pageState.reprocessingObjects.reduce((acc, item) => {
      if (item.batchSize > item.totalQuantity) return acc;
      let itemExcessValue = 0;

      for (const [mineralId, quantity] of Object.entries(
        item.reprocessedMaterials
      )) {
        // Check if this mineral is excess (not requested)
        const isRequestedMineral =
          pageState.requestedMinerals &&
          pageState.requestedMinerals[parseInt(mineralId, 10)];
        if (!isRequestedMineral) {
          const itemPriceObject = findMarketData(mineralId);
          const unitPrice =
            itemPriceObject[pageState.marketLocation][
              pageState.marketListing
            ] ?? 0;
          const totalQuantity =
            item.itemType === reprocessingItemTypes.gas
              ? quantity
              : quantity * (item.reprocessableQuantity / item.batchSize);
          itemExcessValue += unitPrice * totalQuantity;
        }
      }
      return acc + itemExcessValue;
    }, 0);
  }, [
    pageState.reprocessingObjects,
    pageState.requestedMinerals,
    pageState.reprocessingCalculationSettings.sellExcessMineralTypes,
    pageState.marketLocation,
    pageState.marketListing,
    pageState.toMinerals,
    fullItemList,
  ]);

  // Calculate net cost (ore cost minus excess minerals value)
  const netCost = useMemo(() => {
    if (
      !pageState.reprocessingCalculationSettings.sellExcessMineralTypes ||
      pageState.toMinerals
    )
      return null;
    return totalUnreprocessedValue - excessMineralsValue;
  }, [
    totalUnreprocessedValue,
    excessMineralsValue,
    pageState.reprocessingCalculationSettings.sellExcessMineralTypes,
    pageState.toMinerals,
  ]);

  // Calculate reprocessing costs for each mineral within each ore
  const calculateReprocessingCosts = (item) => {
    const itemPriceObject = findMarketData(item.id);
    const oreCost =
      itemPriceObject[pageState.marketLocation][pageState.marketListing] *
      item.totalQuantity;

    // Calculate total reprocessed quantity of all minerals
    let totalReprocessedQuantity = 0;
    const reprocessedQuantities = {};

    Object.entries(item.reprocessedMaterials).forEach(
      ([mineralId, baseQuantity]) => {
        const reprocessedQuantity =
          item.itemType === reprocessingItemTypes.gas
            ? baseQuantity
            : baseQuantity * (item.reprocessableQuantity / item.batchSize);

        reprocessedQuantities[mineralId] = reprocessedQuantity;
        totalReprocessedQuantity += reprocessedQuantity;
      }
    );

    // Calculate market values for each mineral
    const mineralData = {};
    let totalMarketValue = 0;

    Object.entries(reprocessedQuantities).forEach(
      ([mineralId, reprocessedQuantity]) => {
        const mineralPriceObject = findMarketData(mineralId);
        const mineralPrice =
          mineralPriceObject[pageState.marketLocation][
            pageState.marketListing
          ] ?? 0;
        const marketValue = mineralPrice * reprocessedQuantity;

        mineralData[mineralId] = {
          reprocessedQuantity,
          marketValue,
        };
        totalMarketValue += marketValue;
      }
    );

    // Allocate ore cost based on market value proportion
    const reprocessingCosts = {};
    Object.entries(mineralData).forEach(([mineralId, data]) => {
      if (totalMarketValue > 0 && data.reprocessedQuantity > 0) {
        const allocatedCost = (oreCost * data.marketValue) / totalMarketValue;
        const costPerUnit = allocatedCost / data.reprocessedQuantity;
        reprocessingCosts[mineralId] = Math.round(costPerUnit * 100) / 100;
      } else {
        reprocessingCosts[mineralId] = 0;
      }
    });

    return reprocessingCosts;
  };

  if (isLoading || !fullItemList) {
    return <CircularProgress />;
  }

  return (
    <Box>
      <Grid
        container
        spacing={isMobile ? 0.5 : 2}
        alignItems="center"
        sx={{ marginTop: 2, marginBottom: 4 }}
      >
        <Grid
          size={{
            xs: netCost !== null ? 4 : 6,
            md: netCost !== null ? 4 : 6
          }}>
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              {pageState.toMinerals
                ? "Total Unreprocessed Value:"
                : "Total Ore Value:"}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center", mt: 1 }}>
            <Fade in key={`${totalUnreprocessedValue}`} timeout={500}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                {formatNumberForLocale(totalUnreprocessedValue)}
              </Typography>
            </Fade>
          </Box>
          <Box sx={{ textAlign: "center", mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {pageState.toMinerals
                ? "Market value of input ores"
                : "Market value of ores to be reprocessed"}
            </Typography>
          </Box>
        </Grid>

        <Grid
          size={{
            xs: netCost !== null ? 4 : 6,
            md: netCost !== null ? 4 : 6
          }}>
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              {pageState.toMinerals
                ? "Total Reprocessed Value:"
                : "Total Mineral Value:"}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center", mt: 1 }}>
            <Fade in key={`${totalValue}`} timeout={500}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                {formatNumberForLocale(totalValue)}
              </Typography>
            </Fade>
          </Box>
          <Box sx={{ textAlign: "center", mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {pageState.toMinerals
                ? "Market value of processed minerals"
                : "Market value of all minerals produced"}
            </Typography>
          </Box>
        </Grid>

        {/* Net Cost Display - only show when excess minerals are being sold */}
        {netCost !== null && (
          <Grid
            size={{
              xs: 4,
              md: 4
            }}>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                Net Cost (After Sales):
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center", mt: 1 }}>
              <Fade in key={`${netCost}`} timeout={500}>
                <Typography
                  sx={{
                    typography: LARGE_TEXT_FORMAT,
                    color: netCost < 0 ? "success.main" : "text.primary",
                  }}
                >
                  {formatNumberForLocale(netCost)}
                </Typography>
              </Fade>
            </Box>
            <Box sx={{ textAlign: "center", mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                (Ore Value - Excess Minerals Value)
              </Typography>
            </Box>
          </Grid>
        )}
      </Grid>
      <Divider sx={{ marginTop: 2, marginBottom: 2 }} />
      {/* Copy Ore Data Button - only show in "from minerals" mode, hidden on mobile */}
      {!pageState.toMinerals && (
        <Box
          sx={{
            textAlign: "center",
            mb: 2,
            display: { xs: "none", sm: "block" },
          }}
        >
          <Tooltip
            title={
              clipboardAccessible
                ? "Copy ore for multibuy"
                : "Click to request clipboard access"
            }
            arrow
            placement="top"
          >
            <Button
              variant="contained"
              startIcon={<ContentCopyIcon />}
              onClick={
                clipboardAccessible
                  ? handleCopyOreData
                  : handleRequestClipboardAccess
              }
              size="small"
              sx={{ mb: 1 }}
            >
              {clipboardAccessible
                ? "Copy Ore To Clipboard"
                : "Request Access & Copy"}
            </Button>
          </Tooltip>
        </Box>
      )}
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: { xs: "600px", md: "auto" } }}>
          {/* Header Row */}
          <Grid
            container
            spacing={isMobile ? 0.5 : 2}
            alignItems="center"
            sx={{ marginBottom: 2 }}
          >
            <Grid
              sx={{ display: { xs: "none", md: "block" } }}
              size={{
                xs: 0,
                md: 1
              }} />
            <Grid
              sx={{ minWidth: { xs: "150px", md: "auto" } }}
              size={{
                xs: 3,
                md: 3
              }}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
                Item Name
              </Typography>
            </Grid>
            <Grid
              sx={{ textAlign: "center", minWidth: { xs: "80px", md: "auto" } }}
              size={2}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
                Quantity
              </Typography>
            </Grid>
            <Grid
              sx={{
                textAlign: "center",
                minWidth: { xs: "100px", md: "auto" },
              }}
              size={{
                xs: 2,
                md: 2
              }}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
                Unit Price
              </Typography>
            </Grid>
            <Grid
              sx={{
                textAlign: "center",
                minWidth: { xs: "120px", md: "auto" },
              }}
              size={{
                xs: 2,
                md: 2
              }}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
                Total Value
              </Typography>
            </Grid>
            <Grid
              sx={{ textAlign: "center", minWidth: { xs: "80px", md: "auto" } }}
              size={{
                xs: 2,
                md: 1
              }}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
                Yield
              </Typography>
            </Grid>
            {!pageState.toMinerals && (
              <Grid
                sx={{
                  textAlign: "center",
                  minWidth: { xs: "40px", md: "auto" },
                }}
                size={1}>
                <Typography
                  sx={{ typography: LARGE_TEXT_FORMAT }}
                  align="center"
                >
                  Actions
                </Typography>
              </Grid>
            )}
          </Grid>

          <Divider sx={{ marginTop: 2, marginBottom: 2 }} />

          {/* Data Rows */}
          <Grid container spacing={isMobile ? 0.5 : 2}>
            {pageState.reprocessingObjects.map((item) => {
              if (item.batchSize > item.totalQuantity) return null;
              const matchedName = fullItemList[item.id]?.name ?? "Unknown Item";
              const itemPriceObject = findMarketData(item.id);
              const unitPrice =
                itemPriceObject[pageState.marketLocation][
                  pageState.marketListing
                ] ?? 0;
              const totalValue = unitPrice * item.totalQuantity;

              return (
                <Grid container key={item.id} size={12}>
                  <Grid
                    container
                    spacing={isMobile ? 0.5 : 2}
                    alignItems="center"
                    sx={{
                      paddingBottom: 2,
                      mb: 2,
                    }}
                    size={12}>
                    <Grid
                      sx={{
                        textAlign: "center",
                        display: { xs: "none", md: "block" },
                      }}
                      size={{
                        xs: 0,
                        md: 1
                      }}>
                      <Avatar
                        src={`https://images.evetech.net/types/${item.id}/icon?size=32`}
                        alt={matchedName}
                        variant="square"
                        sx={{ height: 32, width: 32 }}
                      />
                    </Grid>
                    <Grid
                      sx={{ minWidth: { xs: "150px", md: "auto" } }}
                      align="center"
                      size={{
                        xs: 3,
                        md: 3
                      }}>
                      <MaterialPopoverIconButtons
                        typeID={item.id}
                        regionID={pageState.marketLocation}
                      >
                        <Typography
                          sx={{
                            typography: STANDARD_TEXT_FORMAT,
                            wordWrap: "break-word",
                            overflowWrap: "break-word",
                            hyphens: "auto",
                            fontWeight: { xs: "bold", md: "normal" },
                          }}
                          align="center"
                        >
                          {matchedName}
                        </Typography>
                      </MaterialPopoverIconButtons>
                    </Grid>

                    <Grid
                      sx={{
                        textAlign: "center",
                        minWidth: { xs: "80px", md: "auto" },
                      }}
                      size={2}>
                      <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                        {formatNumberForLocale(item.totalQuantity, { max: 0 })}
                      </Typography>
                    </Grid>

                    <Grid
                      sx={{
                        textAlign: "center",
                        minWidth: { xs: "100px", md: "auto" },
                      }}
                      size={{
                        xs: 2,
                        md: 2
                      }}>
                      <Fade in key={`${unitPrice}`} timeout={500}>
                        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                          {formatNumberForLocale(unitPrice)}
                        </Typography>
                      </Fade>
                    </Grid>

                    <Grid
                      sx={{
                        textAlign: "center",
                        minWidth: { xs: "120px", md: "auto" },
                      }}
                      size={{
                        xs: 2,
                        md: 2
                      }}>
                      <Fade in key={`${totalValue}`} timeout={500}>
                        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                          {formatNumberForLocale(totalValue)}
                        </Typography>
                      </Fade>
                    </Grid>

                    <Grid
                      sx={{
                        textAlign: "center",
                        minWidth: { xs: "80px", md: "auto" },
                      }}
                      size={{
                        xs: 2,
                        md: 1
                      }}>
                      <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                        {formatNumberForLocale(item.percentageYield)}%
                      </Typography>
                    </Grid>
                    {!pageState.toMinerals && (
                      <Grid
                        sx={{
                          textAlign: "center",
                          minWidth: { xs: "40px", md: "auto" },
                        }}
                        size={1}>
                        <Tooltip title="More options" arrow placement="top">
                          <IconButton
                            onClick={(event) => handleMenuClick(event, item.id)}
                            size="small"
                            color="primary"
                          >
                            <MoreVertIcon />
                          </IconButton>
                        </Tooltip>
                      </Grid>
                    )}
                  </Grid>
                  <Grid container spacing={isMobile ? 0.5 : 2} alignItems="center" size={12}>
                    {Object.entries(item.reprocessedMaterials).map(
                      ([key, quantity]) => {
                        const matchedName =
                          fullItemList[key]?.name ?? "Unknown Item";
                        const itemPriceObject = findMarketData(key);
                        const unitPrice =
                          itemPriceObject[pageState.marketLocation][
                            pageState.marketListing
                          ] ?? 0;

                        // Calculate reprocessing cost for this mineral from this specific ore
                        const reprocessingCosts =
                          calculateReprocessingCosts(item);
                        const reprocessingCostPerUnit =
                          reprocessingCosts[key] || 0;

                        // Check if this mineral was in the original request
                        // In "to minerals" mode, don't highlight anything (all minerals are from input ores)
                        // In "from minerals" mode, highlight minerals that WERE in the original request in green
                        const isRequestedMineral = pageState.toMinerals
                          ? false
                          : pageState.requestedMinerals &&
                            pageState.requestedMinerals[parseInt(key, 10)];

                        // Check if this mineral is excess and should be sold
                        // Only applies when sellExcessMineralTypes is enabled and we're in "from minerals" mode
                        const isExcessMineral =
                          !pageState.toMinerals &&
                          pageState.reprocessingCalculationSettings
                            .sellExcessMineralTypes &&
                          !isRequestedMineral;
                        const totalValue =
                          item.itemType === reprocessingItemTypes.gas
                            ? unitPrice * item.reprocessableQuantity
                            : unitPrice *
                              (quantity *
                                (item.reprocessableQuantity / item.batchSize));
                        return (
                          <Grid
                            container
                            key={key}
                            spacing={1}
                            sx={{
                              marginLeft: isMobile ? 0 : 2,
                              marginY: isMobile ? 0 : 2,
                              padding: isMobile ? "0 8px" : 0,
                              width: isMobile ? "100%" : "auto",
                              maxWidth: isMobile ? "100%" : "none",
                            }}
                            size={isMobile ? 12 : 2}>
                            <MineralCard
                              mineralKey={key}
                              matchedName={matchedName}
                              item={item}
                              quantity={quantity}
                              unitPrice={unitPrice}
                              reprocessingCostPerUnit={reprocessingCostPerUnit}
                              totalValue={totalValue}
                              isRequestedMineral={isRequestedMineral}
                              isExcessMineral={isExcessMineral}
                              pageState={pageState}
                            />
                          </Grid>
                        );
                      }
                    )}
                  </Grid>
                  {!pageState.toMinerals && (
                    <Menu
                      id={`reprocessing-menu-${item.id}`}
                      anchorEl={menuAnchors[item.id]}
                      open={Boolean(menuAnchors[item.id])}
                      onClose={() => handleMenuClose(item.id)}
                      slotProps={{
                        list: {
                          "aria-labelledby": `reprocessing-menu-button-${item.id}`,
                        }
                      }}
                    >
                      <MenuItem onClick={() => handleExcludeOre(item.id)}>
                        Exclude Ore From Selection
                      </MenuItem>
                    </Menu>
                  )}
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Box>
      <Divider sx={{ marginY: 2 }} />
      {!pageState.toMinerals && <ReprocessingSettingsPanel {...props} />}
    </Box>
  );
}

export default AdvancedMineralOutput;
