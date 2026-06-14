import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  selectActiveDlLockScopeBootstrapped,
  selectActiveDlHandoffPendingHolder,
  selectActiveDlLockExpiresAtUnix,
  selectActiveDlLockHeld,
  selectActiveDlLockTtlSeconds,
  selectActiveDlPendingAccessRequest,
  selectActiveDlReadOnly,
  selectActiveDlViewerCount,
  selectActiveDlWaitlistLen,
  selectActiveDlWaitingInHandoffQueue,
  selectHeaderDocumentLockActive,
  selectHeaderDocumentLockReadOnlyStored,
  selectHeaderDocumentLockRegistrations,
  selectSecondaryDocumentLockContended,
} from "../../Functions/DocumentLock/documentLockHeaderSelectors.js";
import {
  docLockScopeKey,
  mergeScopedDocumentLockState,
  scopeHasOtherSessionContention,
} from "../../Functions/DocumentLock/documentLockScope.js";
import {
  LOCK_LOW_REMAINING_NUDGE_SEC,
  LOCK_PASSIVE_VIEWER_FLASH_MS,
} from "../../Functions/DocumentLock/documentLockTimings.js";

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
 * Visibility: uncontested holder sees no icon (quiet UI). The icon surfaces as soon as
 * another session is involved — request access, queued waitlist, handoff probe, you are
 * read-only — or when the lock has orphaned (TTLed with no successor) so the user has a
 * path to take it over.
 *
 * Visuals:
 *   - You hold the lock (contention — pending request / handoff probe / waitlist): warning-coloured.
 *   - Another session holds it (you are read-only): warning-coloured open padlock.
 *   - Lock orphaned: disabled-coloured open padlock, "Take over" button in the popover.
 *   - Lease just renewed: short-lived success tick (`extendAck`).
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
  const [passiveViewerFlash, setPassiveViewerFlash] = useState(false);
  const prevPassiveViewerTrackRef = useRef({ scopeKey: "", count: 0 });
  const [requestAccessPending, startRequestAccess] = useTransition();

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
  const lockScopeBootstrapped = useUsersStore(selectActiveDlLockScopeBootstrapped);
  const viewerCount = useUsersStore(selectActiveDlViewerCount);
  const secondaryContended = useUsersStore(selectSecondaryDocumentLockContended);

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

  useEffect(() => {
    const p = primaryHeaderRegistration(useUsersStore.getState());
    if (!active || !p?.collection || !p?.docID || !lockScopeBootstrapped) {
      prevPassiveViewerTrackRef.current = { scopeKey: "", count: 0 };
      setPassiveViewerFlash(false);
      return undefined;
    }

    const scopeKey = docLockScopeKey(p.collection, p.docID);
    const count =
      typeof viewerCount === "number" && viewerCount > 0
        ? Math.floor(viewerCount)
        : 0;
    const isHolder = lockHeld && !readOnly;
    const prev = prevPassiveViewerTrackRef.current;

    if (prev.scopeKey !== scopeKey) {
      prevPassiveViewerTrackRef.current = { scopeKey, count };
      setPassiveViewerFlash(false);
      return undefined;
    }

    const prevCount = prev.count;
    if (isHolder && prevCount === 0 && count > 0) {
      setPassiveViewerFlash(true);
      prevPassiveViewerTrackRef.current = { scopeKey, count };
      const t = window.setTimeout(
        () => setPassiveViewerFlash(false),
        LOCK_PASSIVE_VIEWER_FLASH_MS
      );
      return () => window.clearTimeout(t);
    }

    prevPassiveViewerTrackRef.current = { scopeKey, count };
    if (count === 0) {
      setPassiveViewerFlash(false);
    }
    return undefined;
  }, [
    active,
    lockHeld,
    readOnly,
    viewerCount,
    lockScopeBootstrapped,
  ]);

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
  /**
   * Lock has expired / been released and no successor was promoted. We still show
   * a header affordance so the user has a path to take over instead of silently
   * becoming editable with no signal — pair with the popover "Take over" button.
   */
  const orphanedVacantOnServer =
    !lockHeld &&
    !readOnly &&
    !handoffPendingHolder &&
    !pendingAccessRequest &&
    !waitingInHandoffQueue &&
    !handoffOfferForMe &&
    !(typeof waitlistLen === "number" && waitlistLen > 0);
  /** Avoid grey vacant flash while acquire is in flight on mount (solo open). */
  const orphanedAvailable =
    lockScopeBootstrapped && orphanedVacantOnServer;

  /**
   * Holder with no contention sees nothing — quiet UI when they're uncontested editor.
   * Secondary-scope contention still surfaces the affordance (e.g. job holder, group queue).
   */
  const hasPassiveViewers = typeof viewerCount === "number" && viewerCount > 0;

  const primaryUncontestedHolder =
    lockScopeBootstrapped &&
    lockHeld &&
    !readOnly &&
    !scopeHasOtherSessionContention({
      readOnly,
      lockHeld,
      waitingInHandoffQueue,
      viewerCount,
      waitlistLen,
      pendingAccessRequest,
      handoffPendingHolder,
      handoffOfferForMe,
    });

  const hasPrimaryLockSignal =
    viewerReadOnly ||
    inconsistentHolderReadOnly ||
    handoffPendingHolder ||
    pendingAccessRequest ||
    (typeof waitlistLen === "number" && waitlistLen > 0) ||
    waitingInHandoffQueue ||
    handoffOfferForMe ||
    orphanedAvailable ||
    hasPassiveViewers;

  /** Hide the affordance until acquire settles (holder, read-only, or queue). */
  const headerBootstrapReady =
    lockScopeBootstrapped || viewerReadOnly || secondaryContended;

  const showHeaderLockIcon =
    headerBootstrapReady &&
    (secondaryContended ||
      (hasPrimaryLockSignal && !primaryUncontestedHolder));

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
    if (orphanedAvailable) return "No active editor — click to take over.";
    if (secondaryContended) {
      return "Another scope tied to this page has contention — see details.";
    }
    if (hasPassiveViewers) {
      // Quiet awareness signal — count only, no holder identity (matches the
      // "no change to popover holder identity" decision).
      const noun = viewerCount === 1 ? "session" : "sessions";
      return `Another ${noun} is viewing this document (${viewerCount}).`;
    }
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
    orphanedAvailable,
    secondaryContended,
    hasPassiveViewers,
    viewerCount,
  ]);

  /**
   * Popover must not keep an anchor ref after the icon unmounts or after lock mode changes
   * (e.g. read-only → holder). Adjusting state during render avoids the one-frame flash
   * where the popover paints against stale lock state before a useEffect runs.
   */
  const lockSignature =
    `${active ? 1 : 0}|${readOnly ? 1 : 0}|${lockHeld ? 1 : 0}` +
    `|${handoffPendingHolder ? 1 : 0}|${pendingAccessRequest ? 1 : 0}` +
    `|${waitlistLen ?? ""}|${waitingInHandoffQueue ? 1 : 0}` +
    `|${handoffOfferForMe ? 1 : 0}|${lockScopeBootstrapped ? 1 : 0}` +
    `|${orphanedAvailable ? 1 : 0}` +
    `|${secondaryContended ? 1 : 0}|${hasPassiveViewers ? 1 : 0}`;
  const [prevLockSignature, setPrevLockSignature] = useState(lockSignature);
  if (prevLockSignature !== lockSignature) {
    setPrevLockSignature(lockSignature);
    if (anchorEl !== null) setAnchorEl(null);
  } else if (anchorEl != null && !anchorEl.isConnected) {
    setAnchorEl(null);
  }

  const anchorValid =
    anchorEl != null && anchorEl.isConnected;

  const lowTimeRemaining =
    remainingSec != null &&
    remainingSec > 0 &&
    remainingSec <= LOCK_LOW_REMAINING_NUDGE_SEC;

  const shouldFlashLowTime =
    active &&
    lowTimeRemaining &&
    !extendAck &&
    (lockHeld || viewerReadOnly);

  const shouldPulseIcon =
    active && !extendAck && (shouldFlashLowTime || passiveViewerFlash);

  const popoverOpen = anchorValid;

  const iconColor = extendAck
    ? theme.palette.success.main
    : handoffPendingHolder
      ? theme.palette.warning.main
      : inconsistentHolderReadOnly
        ? theme.palette.warning.main
        : viewerReadOnly
          ? theme.palette.warning.main
          : orphanedAvailable
            ? theme.palette.text.disabled
            : secondaryContended
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
  ) : orphanedAvailable ? (
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
          ...(shouldPulseIcon
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
                disabled={requestAccessPending}
                aria-busy={requestAccessPending}
                onClick={() => {
                  const p = primaryHeaderRegistration(
                    useUsersStore.getState()
                  );
                  if (!p?.collection || !p?.docID) return;
                  startRequestAccess(async () => {
                    await useUsersStore
                      .getState()
                      .documentLock.actions.requestAccess(
                        p.collection,
                        p.docID
                      );
                  });
                }}
              >
                {requestAccessPending ? "Requesting…" : "Request access"}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                If another tab on your account crashed and you cannot get the lock, you can clear it
                (confirms first — may disrupt an active editor).
              </Typography>
              <Button
                variant="outlined"
                size="small"
                color="warning"
                disabled={requestAccessPending}
                aria-busy={requestAccessPending}
                onClick={() => {
                  const p = primaryHeaderRegistration(
                    useUsersStore.getState()
                  );
                  if (!p?.collection || !p?.docID) return;
                  startRequestAccess(async () => {
                    await useUsersStore
                      .getState()
                      .documentLock.actions.forceReleaseSameAccountEditLock(
                        p.collection,
                        p.docID
                      );
                    setAnchorEl(null);
                  });
                }}
              >
                Clear lock (same account)
              </Button>
            </>
          )}

          {orphanedAvailable && (
            <>
              <Typography variant="body2" color="text.secondary">
                No active editor — the previous lock expired with no successor.
                You can take over to start editing.
              </Typography>
              <Button
                variant="contained"
                size="small"
                disabled={requestAccessPending}
                aria-busy={requestAccessPending}
                onClick={() => {
                  const p = primaryHeaderRegistration(
                    useUsersStore.getState()
                  );
                  if (!p?.collection || !p?.docID) return;
                  startRequestAccess(async () => {
                    await useUsersStore
                      .getState()
                      .documentLock.actions.requestAccess(
                        p.collection,
                        p.docID
                      );
                    setAnchorEl(null);
                  });
                }}
              >
                {requestAccessPending ? "Taking over…" : "Take over"}
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
