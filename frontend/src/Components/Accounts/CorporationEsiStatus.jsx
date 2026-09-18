import { useQueryClient } from "@tanstack/react-query";

import { corporationCollectionStatuses } from "../../Functions/EveESI/prefetch/collectionStatus";
import { heldEsiAccessToken } from "../../Functions/Auth/esiCredentials/provider.js";
import { useCurrentTime } from "../../Hooks/useCurrentTime";
import { useQueryCacheRevision } from "../../Hooks/EveEsi/useQueryCacheRevision";
import EsiStatusList from "./EsiStatusList";

/**
 * What the application holds of each corporation-wide ESI collection.
 *
 * @param {object} props
 * @param {number|string} props.corporationId
 * @param {string} [props.memberHash] - the member whose token these queries spend, which is the
 *   first one tried and therefore the one whose scopes decide what can be asked for
 */
export default function CorporationEsiStatus({ corporationId, memberHash }) {
  const queryClient = useQueryClient();
  const now = useCurrentTime();
  // The cache is read directly rather than observed, so this is what brings a fetch finishing
  // while the list is open onto the screen.
  useQueryCacheRevision(queryClient);
  const statuses = corporationCollectionStatuses(
    queryClient,
    {
      characterHash: memberHash,
      corporationId,
      accessToken: heldEsiAccessToken(memberHash),
    },
    now,
  );

  return <EsiStatusList statuses={statuses} now={now} />;
}
