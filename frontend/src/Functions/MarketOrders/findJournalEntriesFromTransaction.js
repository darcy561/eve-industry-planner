import { getAllCachedCharacterJournal } from "../../Hooks/EveEsi/Character/useGetAllCharacterJournal";
import { getAllCachedCorporationJournal } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal";


export default function findJournalEntriesFromTransaction(transaction, queryClient) {

    const { data: characterJournal } = getAllCachedCharacterJournal(queryClient);
    const { data: corporationJournal } = getAllCachedCorporationJournal(queryClient);

    // Flatten journal entries and filter out undefined/null entries
    const allJournalEntries = [
        ...Object.values(characterJournal || {}).flat(),
        ...Object.values(corporationJournal || {}).flat()
    ].filter((entry) => entry != null); // Filter out null/undefined entries

    const journalEntry = allJournalEntries.find(
        (entry) => transaction?.transaction_id === entry?.context_id
    );

    const transactionTax = allJournalEntries.find(
        (entry) =>
            entry?.ref_type === "transaction_tax" &&
            Date.parse(entry?.date) === Date.parse(transaction?.date)
    );

    return {
        journalEntry,
        transactionTax
    }
}