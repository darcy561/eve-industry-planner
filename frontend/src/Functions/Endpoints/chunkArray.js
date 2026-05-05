/**
 * Split an array into fixed-size chunks (last chunk may be shorter).
 *
 * @template T
 * @param {readonly T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
export function chunkArray(items, size) {
  if (size < 1) {
    throw new Error("chunk size must be at least 1");
  }
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
