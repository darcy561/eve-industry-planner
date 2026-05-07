export default function createTransaction(
  transaction,
  desc,
  journal,
  tax,
  CharacterHash,
  identity = {}
) {
    const isCorp = !transaction.is_personal;
    const corporationID = Number(identity.corporation_id) || undefined;
    const characterID =
        Number(identity.character_id || identity.characterID || identity.issuer_id) ||
        undefined;

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
        is_corp: isCorp,
        type_id: transaction.type_id,
        description: desc,
        CharacterHash: CharacterHash,
        corporation_id: isCorp ? corporationID : undefined,
        character_id: isCorp ? characterID : undefined,
    };
}