import { getAllCachedCharacterJournal } from "../../Hooks/EveEsi/Character/useGetAllCharacterJournal";
import { getAllCachedCorporationJournal } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal";

const MARKET_TRANSACTION = "market_transaction_id";

/**
 * The journal entries behind one sale: the money, and the tax charged on it.
 *
 * A wallet transaction says what was sold; the journal says what it was worth.
 * Both entries name the transaction through `context_id`, so that is what they
 * are matched on. An entry with no context is matched on its timestamp instead,
 * which is all the older cached data offers — and, because several fills of one
 * order can share a second, only when nothing else has claimed it.
 *
 * @param {Object} transaction - A wallet transaction from ESI
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @returns {{journalEntry: Object|undefined, transactionTax: Object|undefined}}
 */
export default function findJournalEntriesFromTransaction(
  transaction,
  queryClient
) {
  const { data: characterJournal } = getAllCachedCharacterJournal(queryClient);
  const { data: corporationJournal } =
    getAllCachedCorporationJournal(queryClient);

  const allJournalEntries = [
    ...Object.values(characterJournal || {}).flat(),
    ...Object.values(corporationJournal || {}).flat(),
  ].filter((entry) => entry != null);

  const transactionID = transaction?.transaction_id;

  const namesThisTransaction = (entry) =>
    entry?.context_id_type === MARKET_TRANSACTION &&
    entry?.context_id === transactionID;

  const namesAnotherTransaction = (entry) =>
    entry?.context_id_type === MARKET_TRANSACTION &&
    entry?.context_id !== transactionID;

  const sameMoment = (entry) =>
    Date.parse(entry?.date) === Date.parse(transaction?.date);

  const journalEntry =
    allJournalEntries.find(
      (entry) =>
        entry?.ref_type === "market_transaction" && namesThisTransaction(entry)
    ) ??
    // Anything else naming this transaction: the typed match is an addition,
    // and must never lose an entry the id alone would have found.
    allJournalEntries.find((entry) => entry?.context_id === transactionID);

  const transactionTax =
    allJournalEntries.find(
      (entry) => entry?.ref_type === "transaction_tax" && namesThisTransaction(entry)
    ) ??
    allJournalEntries.find(
      (entry) =>
        entry?.ref_type === "transaction_tax" &&
        sameMoment(entry) &&
        !namesAnotherTransaction(entry)
    );

  return { journalEntry, transactionTax };
}
