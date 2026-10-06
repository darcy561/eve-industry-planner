import { Box, Typography } from "@mui/material";
import OwnerAvatar from "../../../../../../Styled Components/Avatar/OwnerAvatar";
import StatusChip, {
  STATUS_TONE,
} from "../../../../../../Styled Components/Chip/statusChip";
import { ownerName } from "../../../../../../Functions/Shared/eveOwner";
import { countOf } from "../../../../../../Functions/Helper/numberParser";
import { OWNER_KIND } from "../../../../../../Functions/Shared/ownerKind";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import { selectedSetup } from "../../../../Edit Job Hooks/jobSelectors";

/**
 * Reaction formulas counted by who holds them, marking the open setup's builder or their corporation;
 * a formula carries no research, so there is nothing to apply.
 *
 * @param {{holders: Array<{owner: object, formulas: number, running: number}>}} props
 */
export default function FormulaRows({ holders }) {
  const builder = useJobDraft((job) => selectedSetup(job)?.selectedCharacter);
  const builderCorporation = useUsersStore(
    (state) =>
      state.account.actions.findCharacterByHash(builder)?.corporation_id,
  );
  const buildsWith = (owner) =>
    owner.kind === OWNER_KIND.CORPORATION
      ? builderCorporation != null &&
        String(owner.id) === String(builderCorporation)
      : owner.id === builder;

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {holders.map((holder) => (
        <Box
          key={holder.owner.id}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            "&:last-of-type": { borderBottom: 0 },
          }}
        >
          <OwnerAvatar owner={holder.owner} size={28} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2">{ownerName(holder.owner)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {countOf(holder.formulas, "formula")} · {holder.running} running a
              job
            </Typography>
          </Box>
          {buildsWith(holder.owner) ? (
            <StatusChip label="This setup's" tone={STATUS_TONE.FACT} />
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
