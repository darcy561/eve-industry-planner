import {
  jobFromDocument,
  toDocument,
} from "../Functions/JobDocuments/jobDocument";

/**
 * The job a command leaves behind, rebuilt from the document it changed.
 *
 * @param {object} job - The job the commands are applied to; it is not changed
 * @param {...{recipe: (document: object) => void}} commands
 * @returns {object}
 */
export function jobAfterCommands(job, ...commands) {
  const document = toDocument(job);
  for (const command of commands) command.recipe(document);
  return jobFromDocument(document);
}
