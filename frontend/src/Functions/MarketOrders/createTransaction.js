export default function createTransaction(transaction, desc, journal, tax, CharacterHash) {
    return {
        order_id: null,
        journal_ref_id: transaction.journal_ref_id,
        unit_price: transaction.unit_price,
        amount: journal?.amount || 0,
        tax: Math.abs(tax?.amount) || 0,
        transaction_id: transaction.transaction_id,
        quantity: transaction.quantity,
        date: transaction.date,
        location_id: transaction.location_id,
        is_corp: !transaction.is_personal,
        corporation_id: transaction.corporation_id ?? null,
        character_id: transaction.character_id ?? null,
        type_id: transaction.type_id,
        description: desc,
        CharacterHash: CharacterHash,
    };
}