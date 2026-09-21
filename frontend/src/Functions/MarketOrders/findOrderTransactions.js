import findTransactionsForMarketOrders from "./findTransactionsForMarketOrders";
import findJournalEntriesFromTransaction from "./findJournalEntriesFromTransaction";
import Transaction from "../../Classes/transaction";
import { esiTransactionIDsOf } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * The sales the account holds that belong to this job's linked market orders
 * and are not linked to it already.
 *
 * @param {{marketOrders: object, transactions: object}} esi - The job's ESI data
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {number[]} temporaryTransactionsToAdd
 * @param {number[]} temporaryTransactionsToRemove
 * @returns {import("../../Classes/transaction").default[]}
 */
export default function findOrderTransactions(
  esi,
  queryClient,
  temporaryTransactionsToAdd = [],
  temporaryTransactionsToRemove = [],
) {
  const transactionData = [];
  const matchedTransactionIDs = esiTransactionIDsOf(esi.transactions);

  Object.values(esi.marketOrders ?? {}).forEach((order) => {
    const itemTransactions = findTransactionsForMarketOrders(
      order,
      queryClient,
      matchedTransactionIDs,
      temporaryTransactionsToAdd,
      temporaryTransactionsToRemove,
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
        }),
      );
      matchedTransactionIDs.add(itemTrans.transaction_id);
    });
  });
  return transactionData;
}
