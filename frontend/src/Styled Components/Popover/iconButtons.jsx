import { useState, useRef, useEffect } from "react";
import { Box, Popover } from "@mui/material";
import MarketDataIconButton from "../IconButton/marketData";
import MarketHistoryIconButton from "../IconButton/marketHistory";
import AssetsIconButton from "../IconButton/assets";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A popover component that displays market-related icon buttons on hover.
 * Shows market data, price history, and assets buttons for EVE Online items.
 * Uses hover events with debouncing to show/hide the popover smoothly.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child elements that trigger the popover on hover
 * @param {number} props.typeID - EVE Online type ID of the item
 * @param {string|Object} [props.regionID] - Market region ID or object for market data
 * @returns {JSX.Element} Material popover icon buttons component
 * 
 * @example
 * <MaterialPopoverIconButtons 
 *   typeID={34}
 *   regionID="the_forge"
 * >
 *   <Typography>Tritanium</Typography>
 * </MaterialPopoverIconButtons>
 */
export default function MaterialPopoverIconButtons({
    children,
    typeID,
    regionID,
}) {
    const [anchorEl, setAnchorEl] = useState(null);
    const timeoutRef = useRef(null);
    const isHoveringRef = useRef(false);
    const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);

    const handleMouseEnter = (event) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        isHoveringRef.current = true;
        setAnchorEl(event.currentTarget);
    };

    const handleMouseLeave = () => {
        isHoveringRef.current = false;
        timeoutRef.current = setTimeout(() => {
            if (!isHoveringRef.current) {
                setAnchorEl(null);
            }
        }, 150);
    };

    const handlePopoverMouseEnter = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        isHoveringRef.current = true;
    };

    const handlePopoverMouseLeave = () => {
        isHoveringRef.current = false;
        timeoutRef.current = setTimeout(() => {
            setAnchorEl(null);
        }, 150);
    };
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const open = Boolean(anchorEl);

    return (
        <Box
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            sx={{
                display: "inline-flex",
                cursor: "pointer",
                "& > *": {
                    pointerEvents: "none"
                }
            }}
        >
            {children}
            <Popover
                open={open}
                onClose={() => setAnchorEl(null)}
                anchorEl={anchorEl}
                disableRestoreFocus
                disableScrollLock
                disableAutoFocus
                disableEnforceFocus
                anchorOrigin={{
                    vertical: "top",
                    horizontal: "center",
                }}
                transformOrigin={{
                    vertical: "bottom",
                    horizontal: "center",
                }}
                slotProps={{
                    paper: {
                        onMouseEnter: handlePopoverMouseEnter,
                        onMouseLeave: handlePopoverMouseLeave,
                        onWheel: (e) => {
                            e.stopPropagation();
                        },
                        sx: {
                            p: 1,
                            display: "flex",
                            gap: 0.5,
                            borderRadius: 2,
                            boxShadow: 3,
                            minWidth: "fit-content",
                            pointerEvents: "auto",
                            minHeight: 36,
                            alignItems: "center",
                            justifyContent: "center",
                            width: "fit-content",
                            margin: "0 auto",
                        },
                    }
                }}
                sx={{
                    display: { xs: "none", sm: "block" }
                }}
            >
                <MarketDataIconButton
                    itemTypeID={typeID}
                    locationID={regionID}
                    iconButtonStyle={{ size: "small" }}
                    iconStyle={{
                        '&:hover': {
                            color: 'white',
                        }
                    }}
                />
                <MarketHistoryIconButton
                    itemTypeID={typeID}
                    regionID={regionID}

                    iconButtonStyle={{ size: "small" }}
                    iconStyle={{
                        '&:hover': {
                            color: 'white',
                        }
                    }}
                />
                {isLoggedIn && (
                    <AssetsIconButton
                        materialTypeID={typeID}
                        iconButtonStyle={{ size: "small" }}
                        iconStyle={{
                            '&:hover': {
                                color: 'white',
                            }
                        }}
                    />
                )}
            </Popover>
        </Box>

    );
}