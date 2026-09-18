import { useQueryClient } from "@tanstack/react-query";

import { characterCollectionStatuses } from "../../Functions/EveESI/prefetch/collectionStatus";
import { heldEsiAccessToken } from "../../Functions/Auth/esiCredentials/provider.js";
import { useCurrentTime } from "../../Hooks/useCurrentTime";
import { useQueryCacheRevision } from "../../Hooks/EveEsi/useQueryCacheRevision";
import EsiStatusList from "./EsiStatusList";

/**
 * What the application holds of each ESI collection for one character.
 *
 * Built from the collection table rather than from a list written here, so a collection is
 * described in one place. Corporation-wide collections are not among them: they are fetched once
 * per corporation and are shown there.
 *
 * @param {object} props
 * @param {string} props.characterHash
 */
export default function CharacterEsiStatus({ characterHash }) {
  const queryClient = useQueryClient();
  const now = useCurrentTime();
  // The cache is read directly rather than observed, so this is what brings a fetch finishing
  // while the list is open onto the screen.
  useQueryCacheRevision(queryClient);
  const statuses = characterCollectionStatuses(
    queryClient,
    { characterHash, accessToken: heldEsiAccessToken(characterHash) },
    now,
  );

  return <EsiStatusList statuses={statuses} now={now} />;
}
