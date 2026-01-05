import { getAllCachedCharacterTransactions } from "../../Hooks/EveEsi/Character/useGetAllCharacterTransactions";
import { getAllCachedCorporationTransactions } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationTransactions";
import useUsersStore from "../../Zustand/usersStore";

export default function findTransactionsForMarketOrders(order, queryClient, existingMatchedTransactionIDs = new Set(), temporaryTransactionsToAdd = [], temporaryTransactionsToRemove = []) {
    const linkedTransactions = useUsersStore.getState().users.linkedTrans;
    const { data: characterTransactions } = getAllCachedCharacterTransactions(queryClient);
    const { data: corporationTransactions } = getAllCachedCorporationTransactions(queryClient);

    const allTransactions = [...Object.values(characterTransactions).flat(), ...Object.values(corporationTransactions).flat()];

    const matchedTransactions = [];

    allTransactions.forEach((trans) => {
        if (transactionCriteria(trans)) {
            matchedTransactions.push(trans);
        }
    });

    function transactionCriteria(trans) {
        // Must match location and type
        if (order.location_id !== trans.location_id || order.type_id !== trans.type_id) {
            return false;
        }

        // Must not already be collected
        if (matchedTransactions.some(i => i.transaction_id === trans.transaction_id)) {
            return false;
        }

        // Must not already be matched
        if (existingMatchedTransactionIDs.has(trans.transaction_id) || 
            temporaryTransactionsToAdd.includes(trans.transaction_id)) {
            return false;
        }

        const transactionId = trans.transaction_id;
        const isLinked = linkedTransactions.has(transactionId);
        const isBeingRemoved = temporaryTransactionsToRemove.includes(transactionId);

        // If linked to another job and not flagged for removal, exclude it
        if (isLinked && !isBeingRemoved) {
            return false;
        }

        return true;
    }

    return matchedTransactions;

}