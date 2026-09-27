import { customStructureMap } from "../../Context/defaultValues";
import { structureFromDocument } from "./customStructure";

/**
 * The structures a settings document holds, as one array, from either stored
 * shape: one array keyed by each row's own `jobType`, or four lists keyed by kind.
 *
 * @param {unknown} incoming - What the server sent, in either shape
 * @returns {Object[]}
 */
export default function customStructuresFromServer(incoming) {
  if (Array.isArray(incoming)) {
    return incoming.map((row) => structureFromDocument(row));
  }
  if (incoming == null || typeof incoming !== "object") {
    return [];
  }

  // An array is an object too, so the lists are read only once the array case
  // above has been ruled out.
  const structures = [];
  for (const [jobType, lane] of Object.entries(customStructureMap)) {
    const rows = incoming[lane];
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      // A row that names its own kind keeps it; one that does not takes the kind
      // its list stood for. A stored zero means unnamed, not "job type zero",
      // which is why this is not a spread with a default under it.
      const named = row?.jobType ? row.jobType : Number(jobType);
      structures.push(structureFromDocument({ ...row, jobType: named }));
    }
  }
  return structures;
}
