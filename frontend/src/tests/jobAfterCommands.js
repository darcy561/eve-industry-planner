import Job from "../Classes/job";

/**
 * The job a command leaves behind.
 *
 * A command is a recipe against the job's document, which is how the editor
 * applies one. A test asserting on what the job then reads wants the class
 * around that document, so this runs the commands in order and rebuilds.
 *
 * @param {Job} job - The job the commands are applied to; it is not changed
 * @param {...{recipe: (document: object) => void}} commands
 * @returns {Job}
 */
export function jobAfterCommands(job, ...commands) {
  const document = job.toDocument();
  for (const command of commands) command.recipe(document);
  return new Job(document);
}
