import uuid from "react-uuid";

export function materialPriceObjectFactory(
    typeID,
    itemCount,
    itemCost,
    childJobID = null
) {
    return {
        typeID,
        id: uuid(),
        childID: childJobID,
        childJobImport: childJobID ? true : false,
        itemCount,
        itemCost,
    };
}