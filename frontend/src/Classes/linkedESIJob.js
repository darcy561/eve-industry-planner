/**
 * An EVE industry job linked to one of the planner's jobs.
 *
 * A row keeps ESI's own field names, because that is where it came from and
 * where its updates come from: `job_id`, `end_date`, `is_corporation`. The same
 * fields are `models.LinkedESIJob` on the backend, and
 * {@link LinkedESIJob#toDocument} defines the shape for the SPA.
 *
 * `character_id` and `corporation_id` say whose run it is. They travel as ids
 * and are held as refs once stored, which `shared/jobidentity` converts at the
 * boundary, so the planner sends and receives ids and the database holds
 * neither.
 *
 * @class LinkedESIJob
 */
class LinkedESIJob {
  /**
   * @param {Object} [row] - A linked job row from a job document
   */
  constructor(row) {
    this.status = row?.status ?? "";
    this.CharacterHash = row?.CharacterHash ?? "";
    this.runs = row?.runs ?? 0;
    this.job_id = row?.job_id ?? null;
    this.completed_date = row?.completed_date || null;
    this.station_id = row?.station_id ?? null;
    this.start_date = row?.start_date ?? null;
    this.end_date = row?.end_date ?? null;
    this.cost = row?.cost ?? 0;
    this.blueprint_type_id = row?.blueprint_type_id ?? null;
    this.product_type_id = row?.product_type_id ?? null;
    this.activity_id = row?.activity_id ?? null;
    this.duration = row?.duration ?? 0;
    this.blueprint_id = row?.blueprint_id ?? null;
    this.is_corporation = row?.is_corporation ?? false;
    this.job_type = row?.job_type ?? 0;
    this.corporation_id = row?.corporation_id ?? null;
    this.character_id = row?.character_id ?? null;
  }

  /**
   * Builds a linked job from what ESI returned, for the character that holds it.
   *
   * ESI calls the structure the job runs in `facility_id`; the row keeps it as
   * `station_id`, which is what the universe data is looked up by.
   *
   * The character is the one whose industry jobs were read, so its id is the
   * recorded owner of the run. A corporation id is only ever what the
   * corporation endpoint returned — a character's corporation is not the
   * installer of its personal jobs, so it is never filled in from the owner.
   * Both ids reach the backend as ids and are stored as refs
   * (`shared/jobidentity`).
   *
   * @param {Object} esiJob - An industry job from ESI
   * @param {Object} owner - The character the job was fetched for
   * @param {string} owner.CharacterHash
   * @param {number} [owner.CharacterID]
   * @returns {LinkedESIJob}
   */
  static fromESI(esiJob, owner) {
    const linked = new LinkedESIJob(esiJob);
    linked.CharacterHash = owner?.CharacterHash ?? "";
    linked.station_id = esiJob?.facility_id ?? null;
    linked.character_id = esiJob?.character_id ?? owner?.CharacterID ?? null;
    linked.corporation_id = esiJob?.corporation_id ?? null;
    return linked;
  }

  /**
   * Whether the run was installed for a corporation rather than for the
   * character itself.
   *
   * @returns {boolean}
   */
  get isCorporationJob() {
    return Boolean(this.is_corporation);
  }

  /**
   * Whether the job is still running as far as the planner knows.
   *
   * @returns {boolean}
   */
  get isActive() {
    return this.status === "active";
  }

  /**
   * Whether the output has been taken out of the job.
   *
   * @returns {boolean}
   */
  get isDelivered() {
    return this.status === "delivered";
  }

  /**
   * When the runs finish, in milliseconds, or `null` without an end date.
   *
   * @returns {number|null}
   */
  get finishesAt() {
    const parsed = Date.parse(this.end_date);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Whether the job has run its time and is waiting to be delivered.
   *
   * @returns {boolean}
   */
  get isReadyToDeliver() {
    return this.isActive && this.finishesAt !== null && this.finishesAt <= Date.now();
  }

  /**
   * How far through its run the job is, as a percentage.
   *
   * A delivered job, and one that has run its time, are both finished.
   *
   * @returns {number} 0 to 100
   */
  get progressPercent() {
    if (this.isDelivered || this.isReadyToDeliver) return 100;

    const finishes = this.finishesAt;
    const starts = Date.parse(this.start_date);
    if (finishes === null || Number.isNaN(starts) || finishes <= starts) {
      return 0;
    }

    const run = finishes - starts;
    const left = Math.min(Math.max(finishes - Date.now(), 0), run);
    return 100 - (left / run) * 100;
  }

  /**
   * Takes the latest state of the job from ESI. A job the planner already knows
   * to have finished is left alone.
   *
   * @param {Object} latest - The same job as ESI last returned it
   * @returns {boolean} Whether anything was taken
   */
  applyLatest(latest) {
    if (!latest || !this.isActive) return false;

    this.status = latest.status;
    this.completed_date = latest.completed_date || null;
    this.end_date = latest.end_date;
    return true;
  }

  /**
   * Converts the linked job to its document shape for storage.
   *
   * @returns {Object} Document object ready for storage
   */
  toDocument() {
    return {
      status: this.status,
      CharacterHash: this.CharacterHash,
      runs: this.runs,
      job_id: this.job_id,
      completed_date: this.completed_date,
      station_id: this.station_id,
      start_date: this.start_date,
      end_date: this.end_date,
      cost: this.cost,
      blueprint_type_id: this.blueprint_type_id,
      product_type_id: this.product_type_id,
      activity_id: this.activity_id,
      duration: this.duration,
      blueprint_id: this.blueprint_id,
      is_corporation: this.is_corporation,
      job_type: this.job_type,
      corporation_id: this.corporation_id,
      character_id: this.character_id,
    };
  }
}

export default LinkedESIJob;
