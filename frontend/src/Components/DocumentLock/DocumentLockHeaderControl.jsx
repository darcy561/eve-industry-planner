import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import LockOutlined from "@mui/icons-material/LockOutlined";
import LockOpenOutlined from "@mui/icons-material/LockOpenOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import useUsersStore from "../../Zustand/usersStore.js";
import {
  primaryHeaderRegistration,
  selectActiveDlExtendSegmentCount,
  selectActiveDlHandoffOfferForMe,
  selectActiveDlHandoffPendingHolder,
  selectActiveDlLockExpiresAtUnix,
  selectActiveDlLockHeld,
  selectActiveDlLockTtlSeconds,
  selectActiveDlPendingAccessRequest,
  selectActiveDlReadOnly,
  selectActiveDlWaitlistLen,
  selectActiveDlWaitingInHandoffQueue,
  selectHeaderDocumentLockActive,
  selectHeaderDocumentLockReadOnlyStored,
  selectHeaderDocumentLockRegistrations,
} from "../../Functions/DocumentLock/documentLockHeaderSelectors.js";
import {
  docLockScopeKey,
  mergeScopedDocumentLockState,
} from "../../Functions/DocumentLock/documentLockScope.js";

function secondaryScopeSummary(reg, st) {
  const title =
    reg.label ??
    (reg.collection && reg.docID ? `${reg.collection}` : "Other scope");
  let status = "idle";
  if (st.handoffPendingHolder) status = "confirming next editor…";
  else if (st.readOnly) status = "read-only";
  else if (st.lockHeld && !st.readOnly) status = "editing";
  const limited =
    reg.treeOwnership === "limited"
      ? " · shared tree may limit edits elsewhere"
      : "";
  return `${title}: ${status}${limited}`;
}

/** Seconds remaining before lock segment ends — flash icon when at or below this */
const FLASH_THRESHOLD_SEC = 30;
/** Brief success icon after lease expiry moves forward (renewed) */
const EXTEND_CONFIRM_MS = 1400;

const HANDOFF_PENDING_HOLDER =
  "Rotation point: confirming the next queued session is present (automatic). If they do not respond in time, we try the next waiter. Your lease stays active meanwhile.";

/** @param {number|null|undefined} expiresAtUnix */
function formatLockRemaining(expiresAtUnix) {
  if (expiresAtUnix == null || typeof expiresAtUnix !== "number") return "";
  const rem = Math.max(0, expiresAtUnix - Math.floor(Date.now() / 1000));
  const m = Math.floor(rem / 60);
  const s = rem % 60;
  if (rem <= 0) return "expired";
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Header lock affordance for exclusive edit (`useDocumentLock`).
 * Target `collection` / `docID` come from {@link ../../Zustand/headerDocumentLockUISlice.js}
 * via {@link ../../Hooks/useRegisterHeaderDocumentLockUI.js} or {@link ../../Events/headerDocumentLockEvents.js}.
 *
 * The icon appears only when another session is involved (you are read-only, someone is queued,
 * access was requested, handoff is in progress, etc.). Sole holder with no contention sees no icon.
 */
export default function DocumentLockHeaderControl() {
  const scopes = useUsersStore((s) => s.documentLock.scopes);
  const registrations = useUsersStore(selectHeaderDocumentLockRegistrations);

  /** Only subscribe to stored copy; default string applied below (stable primitive path). */
  const readOnlyStored = useUsersStore(selectHeaderDocumentLockReadOnlyStored);
  const readOnlyMessage =
    readOnlyStored ??
    "This document is being edited in another session (read-only).";
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState(null);
  const [tick, setTick] = useState(0);
  const prevExpiresRef = useRef(null);
  const [extendAck, setExtendAck] = useState(false);

  const active = useUsersStore(selectHeaderDocumentLockActive);
  const readOnly = useUsersStore(selectActiveDlReadOnly);
  const lockHeld = useUsersStore(selectActiveDlLockHeld);
  const handoffPendingHolder = useUsersStore(selectActiveDlHandoffPendingHolder);
  const lockExpiresAtUnix = useUsersStore(selectActiveDlLockExpiresAtUnix);
  const lockTtlSeconds = useUsersStore(selectActiveDlLockTtlSeconds);
  const extendSegmentCount = useUsersStore(selectActiveDlExtendSegmentCount);
  const pendingAccessRequest = useUsersStore(selectActiveDlPendingAccessRequest);
  const waitlistLen = useUsersStore(selectActiveDlWaitlistLen);
  const waitingInHandoffQueue = useUsersStore(selectActiveDlWaitingInHandoffQueue);
  const handoffOfferForMe = useUsersStore(selectActiveDlHandoffOfferForMe);

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active || !lockHeld || readOnly) {
      prevExpiresRef.current =
        lockExpiresAtUnix != null ? lockExpiresAtUnix : null;
      return undefined;
    }
    const cur = lockExpiresAtUnix;
    const prev = prevExpiresRef.current;
    prevExpiresRef.current = cur;
    if (
      prev != null &&
      cur != null &&
      typeof prev === "number" &&
      typeof cur === "number" &&
      cur > prev + 10
    ) {
      setExtendAck(true);
      const t = window.setTimeout(() => setExtendAck(false), EXTEND_CONFIRM_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [active, lockExpiresAtUnix, lockHeld, readOnly]);

  const remainingSec = useMemo(() => {
    if (lockExpiresAtUnix == null || typeof lockExpiresAtUnix !== "number")
      return null;
    return Math.max(0, lockExpiresAtUnix - Math.floor(Date.now() / 1000));
  }, [lockExpiresAtUnix, tick]);

  const ttlLabel =
    lockTtlSeconds != null && lockTtlSeconds > 0
      ? `${Math.round(lockTtlSeconds / 60)} min`
      : null;
  const remainingLabel = formatLockRemaining(lockExpiresAtUnix ?? undefined);

  /** True viewer: not holding the lease (don’t treat transient readOnly patches as “viewer” while lockHeld). */
  const viewerReadOnly = readOnly && !lockHeld;
  /** Stale UI: Redis/client disagree — prefer closed lock + warning until sync settles. */
  const inconsistentHolderReadOnly = readOnly && lockHeld;

  /** Only surface the header control when someone else is in play (not when you are the uncontested holder). */
  const showHeaderLockIcon =
    viewerReadOnly ||
    inconsistentHolderReadOnly ||
    handoffPendingHolder ||
    pendingAccessRequest ||
    (typeof waitlistLen === "number" && waitlistLen > 0) ||
    waitingInHandoffQueue ||
    handoffOfferForMe;

  const tooltipTitle = useMemo(() => {
    if (handoffPendingHolder) return HANDOFF_PENDING_HOLDER;
    if (viewerReadOnly || inconsistentHolderReadOnly) {
      return remainingLabel
        ? `${readOnlyMessage} (~${remainingLabel} on current lock.)`
        : readOnlyMessage;
    }
    if (pendingAccessRequest) {
      return "Another session requested edit access while you hold the lock.";
    }
    if (typeof waitlistLen === "number" && waitlistLen > 0) {
      return `Other sessions are waiting (${waitlistLen} in queue).`;
    }
    if (waitingInHandoffQueue) return "Waiting for edit access.";
    if (handoffOfferForMe) return "You have been offered edit access — respond to continue.";
    if (remainingLabel) return `Edit lock · ~${remainingLabel} remaining`;
    return "Edit lock";
  }, [
    handoffPendingHolder,
    viewerReadOnly,
    inconsistentHolderReadOnly,
    remainingLabel,
    readOnlyMessage,
    pendingAccessRequest,
    waitlistLen,
    waitingInHandoffQueue,
    handoffOfferForMe,
  ]);

  /** Popover must not keep an anchor ref after the icon unmounts or after lock mode changes (e.g. read-only → holder). */
  useEffect(() => {
    if (!active) setAnchorEl(null);
  }, [active]);

  useEffect(() => {
    setAnchorEl(null);
  }, [
    readOnly,
    lockHeld,
    handoffPendingHolder,
    pendingAccessRequest,
    waitlistLen,
    waitingInHandoffQueue,
    handoffOfferForMe,
  ]);

  useLayoutEffect(() => {
    if (anchorEl != null && !anchorEl.isConnected) setAnchorEl(null);
  }, [anchorEl]);

  const anchorValid =
    anchorEl != null && anchorEl.isConnected;

  const lowTimeRemaining =
    remainingSec != null &&
    remainingSec > 0 &&
    remainingSec <= FLASH_THRESHOLD_SEC;

  const shouldFlash =
    active &&
    lowTimeRemaining &&
    !extendAck &&
    (lockHeld || viewerReadOnly);

  const popoverOpen = anchorValid;

  const iconColor = extendAck
    ? theme.palette.success.main
    : handoffPendingHolder
      ? theme.palette.warning.main
      : inconsistentHolderReadOnly
        ? theme.palette.warning.main
        : viewerReadOnly
          ? theme.palette.warning.main
          : theme.palette.primary.main;

  const iconNode = extendAck ? (
    <CheckCircleOutlined sx={{ fontSize: 26 }} htmlColor={iconColor} />
  ) : handoffPendingHolder ? (
    <HourglassEmptyOutlined sx={{ fontSize: 26 }} htmlColor={iconColor} />
  ) : lockHeld ? (
    <LockOutlined sx={{ fontSize: 26 }} htmlColor={iconColor} />
  ) : viewerReadOnly ? (
    <LockOpenOutlined sx={{ fontSize: 26 }} htmlColor={iconColor} />
  ) : (
    <LockOutlined sx={{ fontSize: 26 }} htmlColor={iconColor} />
  );

  if (!active) return null;
  if (!showHeaderLockIcon) return null;

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: { xs: "4px", sm: "8px" },
          ...(shouldFlash && !extendAck
            ? {
                "@keyframes docLockPulse": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0.35 },
                },
                animation: "docLockPulse 1s ease-in-out infinite",
              }
            : {}),
        }}
      >
        <Tooltip title={tooltipTitle} arrow>
          <IconButton
            color="inherit"
            size="small"
            aria-label="Document lock status"
            aria-expanded={popoverOpen ? "true" : undefined}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            {iconNode}
          </IconButton>
        </Tooltip>
      </Box>

      <Popover
        open={popoverOpen}
        anchorEl={anchorValid ? anchorEl : null}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 360,
              p: 2,
              mt: 1,
            },
          },
        }}
      >
        <Stack spacing={1.5}>
          {lockHeld && !handoffPendingHolder && (
            <Typography variant="body2" color="text.secondary">
              {ttlLabel ? (
                <>
                  Edit lock renews every <strong>{ttlLabel}</strong> while this
                  tab stays open and visible; extend runs on an interval
                  server-side.
                </>
              ) : (
                <>You hold the exclusive edit lock.</>
              )}
              {typeof extendSegmentCount === "number" && extendSegmentCount > 0 ? (
                <>
                  {" "}
                  Renewals used: <strong>{extendSegmentCount}</strong> /{" "}
                  <strong>3</strong> before consulting the waitlist (empty queue
                  resets the count).
                </>
              ) : null}
              {remainingLabel ? (
                <>
                  {" "}
                  Session segment ends in ~<strong>{remainingLabel}</strong> unless
                  extended again.
                </>
              ) : null}
            </Typography>
          )}

          {handoffPendingHolder && (
            <Typography variant="body2" color="warning.main">
              {HANDOFF_PENDING_HOLDER}
            </Typography>
          )}

          {viewerReadOnly && (
            <>
              <Typography variant="body2" color="text.secondary">
                {readOnlyMessage}
                {remainingLabel ? (
                  <>
                    {" "}
                    (~<strong>{remainingLabel}</strong> left on current editor
                    lock.)
                  </>
                ) : null}
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  const p = primaryHeaderRegistration(
                    useUsersStore.getState()
                  );
                  if (!p?.collection || !p?.docID) return;
                  void useUsersStore
                    .getState()
                    .documentLock.actions.requestAccess(
                      p.collection,
                      p.docID
                    );
                }}
              >
                Request access
              </Button>
            </>
          )}

          {registrations.length > 1 &&
            registrations.slice(1).map((reg) => {
              if (!reg.collection || !reg.docID) return null;
              const st = mergeScopedDocumentLockState(
                scopes,
                reg.collection,
                reg.docID
              );
              return (
                <Typography
                  key={docLockScopeKey(reg.collection, reg.docID)}
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block" }}
                >
                  {secondaryScopeSummary(reg, st)}
                </Typography>
              );
            })}

        </Stack>
      </Popover>
    </>
  );
}
