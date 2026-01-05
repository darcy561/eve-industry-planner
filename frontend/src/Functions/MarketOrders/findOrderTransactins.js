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
      const descriptionTrim = journalEntry.description
        .replace("Market: ", "")
        .split(" bought");
      transactionData.push(
        createTransaction(
          itemTrans,
          descriptionTrim[0],
          journalEntry,
          transactionTax,
          order.CharacterHash
        )
      );
      matchedTransactionIDs.add(itemTrans.transaction_id);
    });
  });
  return transactionData;
}
