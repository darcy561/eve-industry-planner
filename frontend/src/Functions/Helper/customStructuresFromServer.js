import Structure from "../../Classes/structure";
import { customStructureMap } from "../../Context/defaultValues";

/**
 * The structures a settings document holds, as one array of {@link Structure}.
 *
 * Reads either stored shape. Structures are one array keyed by each row's own
 * `jobType`, and documents written before that held four lists keyed by kind —
 * so a row from a list is stamped with the kind that list stood for, where the
 * row does not already name its own.
 *
 * Rows come back as class instances rather than plain objects because callers
 * take them straight from the store and call methods on them: the store's own
 * actions call `setDefault`, and reprocessing asks a row for its bonuses.
 *
 * @param {unknown} incoming - What the server sent, in either shape
 * @returns {Structure[]}
 */
export default function customStructuresFromServer(incoming) {
  if (Array.isArray(incoming)) {
    return incoming.map((row) => new Structure(row));
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
      structures.push(new Structure({ ...row, jobType: named }));
    }
  }
  return structures;
}
