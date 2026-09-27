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

  const structures = [];
  for (const [jobType, lane] of Object.entries(customStructureMap)) {
    const rows = incoming[lane];
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      const named = row?.jobType ? row.jobType : Number(jobType);
      structures.push(structureFromDocument({ ...row, jobType: named }));
    }
  }
  return structures;
}
