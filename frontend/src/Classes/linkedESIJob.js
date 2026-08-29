/**
 * LinkedESIJob class for tracking EVE Online ESI industry jobs.
 * 
 * This class represents a linked ESI job that tracks real-time progress:
 * - ESI job status and completion tracking
 * - Character and corporation ownership information
 * - Job timing and cost information
 * - Blueprint and product type tracking
 * - Activity and duration information
 * 
 * The LinkedESIJob class provides comprehensive ESI job tracking:
 * - Real-time status updates from EVE Online ESI API
 * - Character ownership tracking for multi-character setups
 * - Corporation job support for corporation industry
 * - Cost and timing information for job planning
 * - Blueprint and product type tracking for industry analysis
 * 
 * @class LinkedESIJob
 * @example
 * // Create linked ESI job from ESI data
 * const linkedJob = new LinkedESIJob(esiJobData, jobOwner);
 * 
 * @example
 * // Access job information
 * console.log('Job ID:', linkedJob.job_id);
 * console.log('Status:', linkedJob.status);
 * console.log('Cost:', linkedJob.cost);
 * console.log('End Date:', linkedJob.end_date);
 */
class LinkedESIJob {
    /**
     * Creates a new LinkedESIJob instance from ESI job data.
     * 
     * @param {Object} originalJob - ESI job data from EVE Online API
     * @param {string} originalJob.job_id - ESI job ID
     * @param {string} originalJob.status - Job status (active, completed, etc.)
     * @param {number} originalJob.runs - Number of runs
     * @param {string} [originalJob.completed_date] - Completion date
     * @param {number} originalJob.facility_id - Facility ID
     * @param {string} originalJob.start_date - Start date
     * @param {string} originalJob.end_date - End date
     * @param {number} originalJob.cost - Installation cost
     * @param {number} originalJob.blueprint_type_id - Blueprint type ID
     * @param {number} originalJob.product_type_id - Product type ID
     * @param {number} originalJob.activity_id - Activity ID
     * @param {number} originalJob.duration - Duration in seconds
     * @param {number} originalJob.blueprint_id - Blueprint ID
     * @param {boolean} originalJob.is_corporation - Whether it's a corporation job
     * @param {number} [originalJob.corporation_id] - Corporation ID
     * @param {number} [originalJob.character_id] - Character ID the job was fetched for
     * @param {Object} owner - Job owner information
     * @param {string} owner.CharacterHash - Character hash of the owner
     */
    constructor(originalJob, owner) {
      this.status = originalJob.status;
      this.CharacterHash = owner.CharacterHash;
      this.runs = originalJob.runs;
      this.job_id = originalJob.job_id;
      this.completed_date = originalJob.completed_date || null;
      this.station_id = originalJob.facility_id;
      this.start_date = originalJob.start_date;
      this.end_date = originalJob.end_date;
      this.cost = originalJob.cost;
      this.blueprint_type_id = originalJob.blueprint_type_id;
      this.product_type_id = originalJob.product_type_id;
      this.activity_id = originalJob.activity_id;
      this.duration = originalJob.duration;
      this.blueprint_id = originalJob.blueprint_id;
      this.is_corporation = originalJob.is_corporation;
      this.corporation_id = originalJob?.corporation_id ?? null
      this.character_id = originalJob?.character_id ?? null
    }
}
  
export default LinkedESIJob