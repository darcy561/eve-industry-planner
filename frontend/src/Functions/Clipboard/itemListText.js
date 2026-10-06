/**
 * Items and quantities as the lines EVE reads back from a paste: a name and a quantity on each, each
 * line ending in a newline.
 *
 * @param {Array<{name: string, quantity: number}>} rows
 * @returns {string}
 */
export function itemListText(rows) {
  return rows.map(({ name, quantity }) => `${name} ${quantity}\n`).join("");
}
