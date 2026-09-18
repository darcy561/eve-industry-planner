const IMAGE_SERVER = "https://images.evetech.net";

/**
 * The pictures EVE serves of an item, by the name the image server knows each one as.
 *
 * A type is the only category with a choice to make — a character has a portrait and a corporation
 * has a logo, and {@link characterImageUrl} and {@link corporationImageUrl} ask for those.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TYPE_IMAGE = Object.freeze({
  ICON: "icon",
  BLUEPRINT: "bp",
  BLUEPRINT_COPY: "bpc",
  RELIC: "relic",
});

/**
 * The id EVE serves its own default portrait and logo under. It has no equivalent for an item: the
 * server answers `types/1/icon` with a 404.
 *
 * @type {number}
 */
export const EVE_DEFAULT_OWNER_ID = 1;

/**
 * The only sizes EVE's image server serves. Anything else is answered with a 400 and no image.
 *
 * @type {number[]}
 */
const IMAGE_SIZES = [32, 64, 128, 256, 512, 1024];

/**
 * The size to ask the image server for, given how many pixels it will be drawn at.
 *
 * Rounds up, so an image is never scaled up from a smaller one.
 *
 * @param {number} pixels
 * @returns {number}
 */
function eveImageSize(pixels) {
  return IMAGE_SIZES.find((size) => size >= pixels) ?? IMAGE_SIZES.at(-1);
}

/**
 * @param {string} category
 * @param {string|number|undefined} id
 * @param {string} variation
 * @param {number} pixels
 * @returns {string|undefined}
 */
function imageUrl(category, id, variation, pixels) {
  if (!id) return undefined;

  return `${IMAGE_SERVER}/${category}/${id}/${variation}?size=${eveImageSize(pixels)}`;
}

/**
 * EVE's picture of an item.
 *
 * @param {number|string} [typeID]
 * @param {string} [variation=TYPE_IMAGE.ICON] - see {@link TYPE_IMAGE}
 * @param {number} [pixels=32] - how large it will be drawn
 * @returns {string|undefined} undefined when there is no id to ask about
 */
export function typeImageUrl(typeID, variation = TYPE_IMAGE.ICON, pixels = 32) {
  return imageUrl("types", typeID, variation, pixels);
}

/**
 * EVE's portrait of a character, by the id the image server wants rather than a CharacterHash.
 *
 * @param {number|string} [characterID]
 * @param {number} [pixels=32]
 * @returns {string|undefined} undefined when there is no id to ask about
 */
export function characterImageUrl(characterID, pixels = 32) {
  return imageUrl("characters", characterID, "portrait", pixels);
}

/**
 * EVE's logo for a corporation.
 *
 * @param {number|string} [corporationID]
 * @param {number} [pixels=32]
 * @returns {string|undefined} undefined when there is no id to ask about
 */
export function corporationImageUrl(corporationID, pixels = 32) {
  return imageUrl("corporations", corporationID, "logo", pixels);
}

/**
 * EVE's logo for an alliance.
 *
 * The image server has no default for one, so an alliance the app holds no id for has no picture
 * rather than a stand-in — which is why this is the one owner helper without a fallback id.
 *
 * @param {number|string} [allianceID]
 * @param {number} [pixels=32]
 * @returns {string|undefined} undefined when there is no id to ask about
 */
export function allianceImageUrl(allianceID, pixels = 32) {
  return imageUrl("alliances", allianceID, "logo", pixels);
}
