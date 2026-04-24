import getCorpAssets from "../../EveESI/Corporation/getAssets";
import getCharacterAssets from "../../EveESI/Character/getAssets";

export async function fetchAssets(userObj = {}, isCorporation = false) {
  try {
    if (!userObj) return [];
    const assetString = isCorporation
      ? `corpAssets_${userObj?.corporation_id}`
      : `assets_${userObj?.CharacterHash}`;

    const functionToCall = isCorporation ? getCorpAssets : getCharacterAssets;
    let matchedAssets = JSON.parse(sessionStorage.getItem(assetString));

    if (!matchedAssets) {
      matchedAssets = await functionToCall(userObj);
    }
    return matchedAssets;
  } catch (err) {
    console.error(err.message);
    return [];
  }
}
