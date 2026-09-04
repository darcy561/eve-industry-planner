import findTransactionsForMarketOrders from "./findTransactionsForMarketOrders";
import findJournalEntriesFromTransaction from "./findJournalEntriesFromTransaction";
import Transaction from "../../Classes/transaction";

export default function findOrderTransactions(
  inputJob,
  queryClient,
  temporaryTransactionsToAdd = [],
  temporaryTransactionsToRemove = []
) {
  const transactionData = [];
  const matchedTransactionIDs = inputJob.esiTransactionIDs;

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
      // A sale is offered only once the account can supply every figure the row
      // will store. The journal carries the money, the description and the tax,
      // and it is a separate endpoint that can lag the transactions — a row
      // linked without them keeps a blank description and no tax for good,
      // understating what the job paid.
      if (!journalEntry?.description || !transactionTax) return;

      const descriptionTrim = journalEntry.description
        .replace("Market: ", "")
        .split(" bought");
      transactionData.push(
        Transaction.fromESI(itemTrans, {
          journalEntry,
          taxEntry: transactionTax,
          description: descriptionTrim[0],
          owner: { CharacterHash: order.CharacterHash },
        })
      );
      matchedTransactionIDs.add(itemTrans.transaction_id);
    });
  });
  return transactionData;
}
