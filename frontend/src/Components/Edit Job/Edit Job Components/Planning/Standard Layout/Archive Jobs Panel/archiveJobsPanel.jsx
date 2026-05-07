import { useMemo, useState } from "react";
import {
  Icon,
  Typography,
  Tooltip,
  Grid,
  Box,
  Avatar,
  FormControl,
  MenuItem,
  Select,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { useArchiveJobsSnapshotsQuery } from "../../../../../../Hooks/React Query/Backend/buildStats";

const cellTextSx = { typography: STANDARD_TEXT_FORMAT };

/** Compact owner column avatars (pixels). */
const ARCHIVE_AVATAR_PX = 22;

/** Blueprint / linked-jobs pattern — logo size matches rendered avatar. */
function eveCorporationLogoUrl(corporationId) {
  return `https://images.evetech.net/corporations/${corporationId}/logo?size=32`;
}

function eveCharacterPortraitUrl(characterId) {
  if (characterId == null || characterId === "") return undefined;
  return `https://images.evetech.net/characters/${characterId}/portrait?size=64`;
}

/**
 * Grid spans for `sm+` — manufacturing & reaction share the same columns (incl. profit/loss).
 * Owner 1 + produced 3 + cost 3 + per item 2 + profit 2 + child 1 = 12.
 */
function archivePanelSmColumns() {
  return {
    scope: { xs: 12, sm: 1 },
    produced: { xs: 0, sm: 3 },
  };
}

/**
 * Distinct positive corporation IDs from snapshot tx/fee lines (`resolvedCorpID` from worker).
 * @returns {number[]}
 */
function collectResolvedCorpIDs(doc) {
  const ids = new Set();
  for (const line of [...(doc.transactionLines ?? []), ...(doc.feeLines ?? [])]) {
    const raw = line.resolvedCorpID ?? line.resolvedCorpId;
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? parseInt(raw, 10)
          : NaN;
    if (Number.isFinite(n) && n > 0) {
      ids.add(n);
    }
  }
  for (const raw of doc.linkedIndustryCorpIDs ?? []) {
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? parseInt(raw, 10)
          : NaN;
    if (Number.isFinite(n) && n > 0) {
      ids.add(n);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * @returns {'corp_owned' | 'corp_activity' | 'personal'}
 */
function archivedSnapshotCorpKind(doc) {
  if (doc.corpRef?.trim()) {
    return "corp_owned";
  }
  const linkedCorpIds = doc.linkedIndustryCorpIDs ?? [];
  if (
    linkedCorpIds.some(
      (id) =>
        (typeof id === "number" && id > 0) ||
        (typeof id === "string" && /^\d+$/.test(id) && parseInt(id, 10) > 0)
    )
  ) {
    return "corp_activity";
  }
  for (const t of doc.transactionLines ?? []) {
    if (t.isCorp) return "corp_activity";
    if (t.corpStatus && t.corpStatus !== "personal") return "corp_activity";
  }
  for (const f of doc.feeLines ?? []) {
    if (f.isCorp) return "corp_activity";
    if (f.corpStatus && f.corpStatus !== "personal") return "corp_activity";
  }
  return "personal";
}

/** @param {'entire' | 'corp' | 'personal'} scope — `entire` avoids `"all"` clashes elsewhere (layout/search). */
function archivedSnapshotMatchesDisplayScope(doc, scope) {
  if (scope === "entire") return true;
  const kind = archivedSnapshotCorpKind(doc);
  if (scope === "personal") return kind === "personal";
  if (scope === "corp") return kind !== "personal";
  return true;
}

function CellText({ children, ref, ...props }) {
  return (
    <Typography ref={ref} align="center" sx={cellTextSx} {...props}>
      {children}
    </Typography>
  );
}

function HeaderCell({ size, sx, tooltip, children }) {
  const label = <CellText>{children}</CellText>;
  return (
    <Grid size={size} sx={sx}>
      {tooltip ? (
        <Tooltip title={tooltip} arrow placement="top">
          {label}
        </Tooltip>
      ) : (
        label
      )}
    </Grid>
  );
}

function ArchiveTableHeader({ smCols }) {
  return (
    <Grid container size={12}>
      <HeaderCell
        size={smCols.scope}
        sx={{ display: { xs: "none", sm: "block" } }}
        tooltip="Corporation logo or your main character — hover for name"
      >
        Owner
      </HeaderCell>
      <HeaderCell
        size={smCols.produced}
        sx={{ display: { xs: "none", sm: "block" } }}
      >
        Total Items Produced
      </HeaderCell>
      <HeaderCell size={{ xs: 4, sm: 3 }}>Total Job Cost</HeaderCell>
      <HeaderCell size={{ xs: 4, sm: 2 }}>Job Cost Per Item</HeaderCell>
      <HeaderCell
        size={{ xs: 4, sm: 2 }}
        tooltip="Jobs without any sales data will always display 0"
      >
        Profit/Loss
      </HeaderCell>
      <HeaderCell
        size={{ xs: 0, sm: 1 }}
        sx={{ display: { xs: "none", sm: "block" } }}
        tooltip="Whether this job was a child job used to build a parent."
      >
        Child Job
      </HeaderCell>
    </Grid>
  );
}

function snapshotJobCostTotal(doc) {
  return (
    (doc.totalBuildCosts ?? 0) +
    (doc.totalInstallCost ?? 0) +
    (doc.totalExtras ?? 0) +
    (doc.totalInventionCost ?? 0)
  );
}

function snapshotProfitLoss(doc) {
  let pl = 0;
  for (const t of doc.transactionLines ?? []) {
    pl += t.profit ?? 0;
  }
  for (const f of doc.feeLines ?? []) {
    pl -= f.amount ?? 0;
  }
  return pl;
}

/**
 * EVE Image Exchange avatars only — tooltips use Zustand corp names or main character name.
 */
function ArchiveScopeAvatars({
  kind,
  corpIds,
  getCorporation,
  mainCharacter,
}) {
  if (kind === "personal" && mainCharacter?.CharacterID) {
    const name = mainCharacter.CharacterName ?? "Character";
    return (
      <Tooltip title={name} arrow placement="top">
        <Avatar
          src={eveCharacterPortraitUrl(mainCharacter.CharacterID)}
          alt=""
          sx={{ width: ARCHIVE_AVATAR_PX, height: ARCHIVE_AVATAR_PX }}
          imgProps={{ loading: "lazy", decoding: "async" }}
        />
      </Tooltip>
    );
  }

  if (corpIds?.length > 0) {
    const maxVisible = 3;
    const shown = corpIds.slice(0, maxVisible);
    const rest = corpIds.length - maxVisible;
    return (
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.35,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {shown.map((id) => {
          const corp = getCorporation(id);
          const title = corp?.corporationName ?? `Corporation ${id}`;
          return (
            <Tooltip key={id} title={title} arrow placement="top">
              <Avatar
                src={eveCorporationLogoUrl(id)}
                alt=""
                variant="rounded"
                sx={{
                  width: ARCHIVE_AVATAR_PX,
                  height: ARCHIVE_AVATAR_PX,
                }}
                imgProps={{ loading: "lazy", decoding: "async" }}
              />
            </Tooltip>
          );
        })}
        {rest > 0 ? (
          <Typography component="span" variant="caption" sx={{ fontSize: 10 }}>
            +{rest}
          </Typography>
        ) : null}
      </Box>
    );
  }

  if (kind !== "personal") {
    return (
      <Tooltip
        title="Corporation job — no resolved corporation ID on snapshot lines"
        arrow
        placement="top"
      >
        <Avatar
          variant="rounded"
          sx={{
            width: ARCHIVE_AVATAR_PX,
            height: ARCHIVE_AVATAR_PX,
            typography: "caption",
            fontSize: 12,
            bgcolor: "action.selected",
          }}
        >
          ?
        </Avatar>
      </Tooltip>
    );
  }

  return (
    <Avatar
      sx={{
        width: ARCHIVE_AVATAR_PX,
        height: ARCHIVE_AVATAR_PX,
        typography: "caption",
        fontSize: 12,
      }}
    >
      ?
    </Avatar>
  );
}

function ArchiveJobRow({ doc, smCols, getCorporation, mainCharacter }) {
  const theme = useTheme();
  const produced = doc.totalProduced ?? 0;
  const jobCost = snapshotJobCostTotal(doc);
  const profitLoss = snapshotProfitLoss(doc);
  const kind = archivedSnapshotCorpKind(doc);
  const corpIds = collectResolvedCorpIDs(doc);

  const rowTint =
    kind === "corp_owned"
      ? {
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          borderLeftColor: theme.palette.primary.main,
        }
      : kind === "corp_activity"
        ? {
            bgcolor: alpha(theme.palette.info.main, 0.08),
            borderLeftColor: theme.palette.info.main,
          }
        : {
            bgcolor: alpha(theme.palette.grey[500], 0.06),
            borderLeftColor: theme.palette.divider,
          };

  const innerGrid = (
    <Grid container size={12} sx={{ alignItems: "center" }}>
      <Grid
        size={smCols.scope}
        sx={{
          display: { xs: "none", sm: "flex" },
          justifyContent: "center",
          alignItems: "center",
          py: 0.5,
        }}
      >
        <ArchiveScopeAvatars
          kind={kind}
          corpIds={corpIds}
          getCorporation={getCorporation}
          mainCharacter={mainCharacter}
        />
      </Grid>
      <Grid
        size={smCols.produced}
        sx={{ display: { xs: "none", sm: "block" } }}
      >
        <CellText>
          {formatNumberForLocale(produced, { max: 0 })}
        </CellText>
      </Grid>
      <Grid size={{ xs: 4, sm: 3 }}>
        <CellText>{formatNumberForLocale(jobCost)}</CellText>
      </Grid>
      <Grid size={{ xs: 4, sm: 2 }}>
        <CellText>
          {formatNumberForLocale(produced > 0 ? jobCost / produced : 0)}
        </CellText>
      </Grid>
      <Grid size={{ xs: 4, sm: 2 }}>
        <CellText>{formatNumberForLocale(profitLoss)}</CellText>
      </Grid>
      <Grid
        align="center"
        size={{ xs: 0, sm: 1 }}
        sx={{ display: { xs: "none", sm: "block" } }}
      >
        {doc.isProductionChain ? (
          <Icon fontSize="small" color="success">
            <CheckIcon />
          </Icon>
        ) : (
          <Icon fontSize="small" color="disabled">
            <CloseIcon />
          </Icon>
        )}
      </Grid>
    </Grid>
  );

  const jobTip =
    doc.jobID != null && doc.jobID !== "" ? `Job ID: ${doc.jobID}` : "";

  return (
    <Box
      sx={{
        borderRadius: 1,
        borderLeftWidth: 3,
        borderLeftStyle: "solid",
        ...rowTint,
      }}
    >
      <Box
        sx={{
          display: { xs: "flex", sm: "none" },
          justifyContent: "center",
          py: 1,
        }}
      >
        {jobTip ? (
          <Tooltip title={jobTip} arrow placement="top">
            <span>
              <ArchiveScopeAvatars
                kind={kind}
                corpIds={corpIds}
                getCorporation={getCorporation}
                mainCharacter={mainCharacter}
              />
            </span>
          </Tooltip>
        ) : (
          <ArchiveScopeAvatars
            kind={kind}
            corpIds={corpIds}
            getCorporation={getCorporation}
            mainCharacter={mainCharacter}
          />
        )}
      </Box>

      {jobTip ? (
        <Tooltip title={jobTip} arrow placement="top">
          <Box>{innerGrid}</Box>
        </Tooltip>
      ) : (
        innerGrid
      )}
    </Box>
  );
}

export default function ArchiveJobsPanel({ state }) {
  const [displayScope, setDisplayScope] = useState("entire");
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const smCols = archivePanelSmColumns();
  const getCorporation = useUsersStore((s) => s.account.actions.getCorporation);
  const mainCharacter = useUsersStore(
    (s) => s.account.characters?.find((ch) => ch?.isMainCharacter) ?? null
  );

  const {
    data: snapshotsPayload,
    isLoading,
    isError,
    error,
  } = useArchiveJobsSnapshotsQuery(state.activeJob?.itemID);

  const snapshots = snapshotsPayload?.snapshots ?? [];
  const hasData = snapshots.length > 0;

  const filteredSnapshots = useMemo(
    () =>
      snapshots.filter((doc) =>
        archivedSnapshotMatchesDisplayScope(doc, displayScope)
      ),
    [snapshots, displayScope]
  );
  const hasMatchingRows = filteredSnapshots.length > 0;

  return (
    <ContentPanel
      visible={isLoggedIn}
      title="Archived Job Data"
      paperSx={{ height: "auto" }}
      contentGridSx={{ overflow: "visible" }}
      componentName="Archive Jobs Panel"
      isLoading={isLoading}
      isError={isError}
      error={error}
      loadingMessage="Loading archived data…"
    >
      <Grid
        container
        spacing={2}
        sx={{
          width: "100%",
        }}
      >
        <Grid
          size={12}
          sx={{ display: "flex", justifyContent: "flex-end" }}
        >
          <FormControl variant="standard" size="small" sx={{ minWidth: 120 }}>
            <Select
              id="archive-jobs-display-scope"
              value={displayScope}
              onChange={(e) => setDisplayScope(e.target.value)}
              inputProps={{
                "aria-label": "Archived jobs display scope",
              }}
              MenuProps={{ disableScrollLock: true }}
            >
              <MenuItem value="entire">All</MenuItem>
              <MenuItem value="corp">Corporation</MenuItem>
              <MenuItem value="personal">Personal</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <ArchiveTableHeader smCols={smCols} />
        <Grid container size={12} spacing={2}>
          {!hasData ? (
            <Grid size={12}>
              <Typography sx={cellTextSx} align="center">
                No Archived Job Data To Display
              </Typography>
            </Grid>
          ) : !hasMatchingRows ? (
            <Grid size={12}>
              <Typography sx={cellTextSx} align="center">
                No Jobs Match This Display
              </Typography>
            </Grid>
          ) : (
            filteredSnapshots.map((doc) => (
              <Grid key={doc.jobID} size={12}>
                <ArchiveJobRow
                  doc={doc}
                  smCols={smCols}
                  getCorporation={getCorporation}
                  mainCharacter={mainCharacter}
                />
              </Grid>
            ))
          )}
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
