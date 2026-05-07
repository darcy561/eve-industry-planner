import findTransactionsForMarketOrders from "./findTransactionsForMarketOrders";
import findJournalEntriesFromTransaction from "./findJournalEntriesFromTransaction";
import createTransaction from "./createTransaction";

export default function findOrderTransactins(
  inputJob,
  queryClient,
  temporaryTransactionsToAdd = [],
  temporaryTransactionsToRemove = []
) {
  const transactionData = [];
  const matchedTransactionIDs = new Set([...inputJob.apiTransactions]);

  inputJob.build.sale.marketOrders.forEach((order) => {
    const itemTransactions = findTransactionsForMarketOrders(
      order,
      queryClient,
      matchedTransactionIDs,
      temporaryTransactionsToAdd,
      temporaryTransactionsToRemove
    );

    itemTransactions.forEach((itemTrans) => {
      const { journalEntry, transactionTax } =
        findJournalEntriesFromTransaction(itemTrans, queryClient);
      if (!journalEntry && !transactionTax) return;
      
      // Guard against undefined journalEntry when accessing description
      if (!journalEntry || !journalEntry.description) return;
      
      const descriptionTrim = journalEntry.description
        .replace("Market: ", "")
        .split(" bought");
      transactionData.push(
        createTransaction(
          itemTrans,
          descriptionTrim[0],
          journalEntry,
          transactionTax,
          order.CharacterHash,
          {
            corporation_id: order.corporation_id,
            character_id: order.character_id || order.characterID || order.issuer_id,
          }
        )
      );
      matchedTransactionIDs.add(itemTrans.transaction_id);
    });
  });
  return transactionData;
}
