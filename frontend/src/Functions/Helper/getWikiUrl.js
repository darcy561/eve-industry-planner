/**
 * Wiki help URL: `wiki.{current hostname}/{path}`.
 * Path segments are encoded; hashes stay as fragment identifiers.
 */
export function getWikiUrl(path = "") {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const hashIndex = cleanPath.indexOf("#");
  const pathname = hashIndex === -1 ? cleanPath : cleanPath.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : cleanPath.slice(hashIndex);
  const encoded = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${protocol}//wiki.${hostname}/${encoded}${hash}`;
}
