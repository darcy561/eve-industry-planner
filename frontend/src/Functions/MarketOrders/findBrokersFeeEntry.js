import { getAllCachedCharacterJournal } from "../../Hooks/EveEsi/Character/useGetAllCharacterJournal";
import { getAllCachedCorporationJournal } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal";
import BrokerFee from "../../Classes/brokerFee";

/**
 * The broker fee row for one market order.
 *
 * The amount is always the figure worked out for this order, never the journal
 * entry's own: listing several orders at once through multi-sell charges them
 * in a single `brokers_fee` entry whose amount covers all of them. For the same
 * reason the entry's id is shared between those orders and is not an identity
 * for the fee.
 *
 * The journal supplies only when the fee was charged. It is a separate endpoint
 * from the orders, so it can lag behind one — in which case the fee is still
 * recorded, dated by the listing itself. Whose fee it is comes from the order
 * it belongs to, which records that already.
 *
 * @param {Object} order - The market order being linked
 * @param {number} brokersFee - What the listing cost this order
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @returns {BrokerFee}
 */
export default function findBrokersFeeEntry(order, brokersFee, queryClient) {
  const { data: characterJournal } = getAllCachedCharacterJournal(queryClient);
  const { data: corporationJournal } =
    getAllCachedCorporationJournal(queryClient);

  const journalEntries = [
    ...Object.values(characterJournal || {}).flat(),
    ...Object.values(corporationJournal || {}).flat(),
  ];

  const entry = journalEntries.find(
    (candidate) =>
      candidate?.ref_type === "brokers_fee" &&
      Date.parse(order?.issued) === Date.parse(candidate?.date)
  );

  return BrokerFee.fromJournalEntry(entry, order, brokersFee);
}
