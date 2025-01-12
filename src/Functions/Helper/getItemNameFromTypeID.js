import fullItemList from "../../RawData/fullItemList.json";

function getItemNameFromTypeID(typeID) {
  try {
    if (!typeID) {
      throw new Error("Missing TypeID");
    }
    if (typeof typeID !== "string" && typeof typeID !== "number") {
      throw new Error("Invalid TypeID format");
    }
    if (!fullItemList) {
      throw new Error("Full item list not loaded");
    }

    return fullItemList[typeID]?.name || "Unknown Item";
  } catch (err) {
    console.error(err.message);
    return "Unknown item";
  }
}

export default getItemNameFromTypeID;
