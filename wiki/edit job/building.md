# Edit Job - Building Stage

The Building stage is where you track active manufacturing jobs that are currently running in EVE Online. This stage allows you to link your planned jobs to actual industry jobs from the ESI API, monitor their progress, and track completion.

## Stage Purpose

The Building stage serves to:
- **Link to ESI jobs** by connecting your planned jobs to active industry jobs from EVE Online
- **Monitor progress** by tracking build time, completion status, and job details from the game
- **Track costs** by automatically importing installation costs from linked ESI jobs
- **Manage job execution** by viewing which jobs are active, delivered, or cancelled
- **Prepare for completion** by ensuring all jobs are properly tracked before moving to the complete stage

## Lifecycle Position

The Building stage appears after purchasing in the job lifecycle:

1. [Planning](planning) - Configuring job parameters and reviewing requirements
2. [Purchasing](purchasing) - Acquiring materials and recording costs
3. **Building** ← You are here
4. [Complete](complete) - Finished production ready for sale
5. [Selling](selling) - Managing sales and market orders

After completing the building stage (all jobs delivered), jobs move to the Complete stage where you finalize costs and prepare for sale.

## Building Panels

The Building stage consists of the following panels:

### [Information Panel](building/information%20panel)
Displays total material costs, installation costs, and cost per item for quick reference during the building process.

### [Tab Panel](building/tab%20panel)
Manages ESI job linking with two tabs: Available Jobs (jobs that can be linked) and Linked Jobs (currently connected jobs with progress tracking).

### [Job Setup Info](purchasing/job%20setup%20info)
Horizontal scrollable view of all job setups showing configuration details, production quantities, and structure information (shared with purchasing stage).

## Related Documentation

- [Edit Job Overview](edit%20job) - Complete job editing guide
- [Purchasing Stage](purchasing) - Previous stage in the lifecycle
- [Complete Stage](complete) - Next stage in the lifecycle
