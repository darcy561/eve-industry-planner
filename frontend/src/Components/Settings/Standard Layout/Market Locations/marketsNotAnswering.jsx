import { Button, Stack, Typography } from "@mui/material";

import InsetSurface from "../../../../Styled Components/Paper/InsetSurface";
import { useLinkCharacter } from "../../../Accounts/useLinkCharacter";

/**
 * The way out of a market that will not answer.
 *
 * One offer for the whole list: linking is an act on the account, and the
 * character it adds may answer for every market here at once. Absent entirely
 * when nothing is wrong.
 *
 * @param {object} props
 * @param {Array<{readProblem?: object}>} props.rows - The markets as the table
 *   drew them
 */
export default function MarketsNotAnswering({ rows }) {
  const { linkCharacter, isLinking } = useLinkCharacter();
  const affected = rows.filter((row) => row.readProblem).length;

  if (affected === 0) return null;

  return (
    <InsetSurface>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <Typography variant="body2" color="text.secondary">
          {affected === 1
            ? "One of your markets is not answering. "
            : `${affected} of your markets are not answering. `}
          Linking a character that can dock at them, or re-authorising one you
          already have, lets their prices arrive on the next refresh.
        </Typography>
        <Button
          variant="outlined"
          size="small"
          disabled={isLinking}
          onClick={() => linkCharacter()}
          sx={{ flexShrink: 0 }}
        >
          Link a character
        </Button>
      </Stack>
    </InsetSurface>
  );
}
