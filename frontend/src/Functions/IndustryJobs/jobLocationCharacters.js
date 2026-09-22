/**
 * Every place an industry job row names, paired with the character that ran it.
 *
 * A job is installed by a character standing at the facility, so that character can see it — which
 * is what spares a player structure's name lookup a refusal from everybody else on the account.
 *
 * Both shapes of row are taken because both reach the same lookup: a match straight from ESI names
 * its installer by character id and its `facility_id`, a row the job has stored names the hash it
 * was linked under and its `station_id`.
 *
 * @param {Array<Object>} [jobs]
 * @param {Array<Object>} [characters] - the account's characters, for resolving an installer id
 * @returns {Array<[number|null, string|null]>} for {@link import("../../Hooks/EveEsi/useLocationNames").charactersByLocation}
 */
export default function jobLocationCharacters(jobs = [], characters = []) {
  const hashById = new Map(
    characters.map((character) => [
      character.CharacterID,
      character.CharacterHash,
    ]),
  );

  return jobs.flatMap((job) => {
    const hash = job.CharacterHash || hashById.get(job.installer_id) || null;
    return [job.location_id, job.facility_id, job.station_id].map((id) => [
      id,
      hash,
    ]);
  });
}
