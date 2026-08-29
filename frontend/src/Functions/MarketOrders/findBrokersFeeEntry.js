import { getAllCachedCharacterJournal } from "../../Hooks/EveEsi/Character/useGetAllCharacterJournal";
import { getAllCachedCorporationJournal } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationJournal";

export default function findBrokersFeeEntry(order, brokersFee, queryClient) {

    const { data: characterJournal } = getAllCachedCharacterJournal(queryClient);
    const { data: corporationJournal } = getAllCachedCorporationJournal(queryClient);

    function ESIBrokerFee(entry, order, brokersFee) {
        return {
            order_id: order.order_id,
            id: entry.id,
            complete: false,
            date: entry.date,
            amount: brokersFee || 0,
            corporation_id: order.corporation_id ?? null,
            character_id: entry.character_id ?? null,
            CharacterHash: order.CharacterHash
        }
    }

    const checkEntry = (entry) => {
        if (
            entry?.ref_type === "brokers_fee" ||
            Date.parse(order?.issued) === Date.parse(entry?.date)
        ) {
            return ESIBrokerFee(entry, order, brokersFee);
        }
        return null;
    };

    const journalEntries = [...Object.values(characterJournal).flat(), ...Object.values(corporationJournal).flat()];

    for (const entry of journalEntries) {
        const brokerFee = checkEntry(entry);
        if (brokerFee !== null) {
            return brokerFee;
        }
    }

    return null;
}