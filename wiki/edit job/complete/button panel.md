# Button Panel

The Button Panel provides action buttons for managing job completion, including marking jobs as complete in groups, passing build costs to parent jobs, marking jobs for sale, and archiving completed jobs.

## Overview

The Button Panel provides:
- **Group completion** marking jobs as complete in group workflows
- **Cost passing** sending build costs to parent jobs in production chains
- **Sale preparation** marking jobs as ready for sale
- **Job archiving** storing job data for historical analysis

## Button Layout

### Button Arrangement
- **Position**: Right-aligned at bottom of complete stage
- **Spacing**: Consistent margins between buttons
- **Size**: Small variant buttons
- **Order**: Buttons appear based on job context and user permissions

## Available Buttons

### Sell Group Job Button
- **Label**: "Ready For Sale" or "Not Ready For Sale"
- **Visibility**: 
  - Only shown when job is in a group
  - Only shown when job has no parent jobs
- **Function**: Toggles job's ready-for-sale status
- **Behavior**:
  - When marking ready: Advances job status and sets ready flag
  - When unmarking: Removes ready flag and removes from snapshot
- **Tooltip**: "Sell"
- **Disabled**: Disabled when already marked as ready

### Mark As Complete Button
- **Label**: "Mark As Complete" or "Mark As Incomplete"
- **Visibility**: Only shown when job is in a group
- **Function**: Toggles completion status in group
- **Behavior**:
  - Adds job ID to group's complete set when marking complete
  - Removes job ID from group's complete set when marking incomplete
- **Purpose**: Track completion status for group workflows

### Pass Build Costs Button
- **Label**: "Send Build Costs" or "Send Build Costs & Complete"
- **Visibility**: Only shown when job has parent jobs
- **Function**: Sends build costs to all parent jobs
- **Tooltip**: "Sends the item build cost to all parent jobs."
- **Behavior**:
  1. Calculates build cost per item
  2. Sends cost to all parent jobs as material cost
  3. If in group, also marks job as complete
  4. Updates parent jobs with new costs
  5. Shows success or error message
- **Purpose**: Automate cost passing in production chains

### Archive Job Button
- **Label**: "Archive Job"
- **Visibility**: 
  - Only shown when logged in
  - Only shown when job is NOT in a group
- **Function**: Archives job for historical reference
- **Tooltip**: "Removes the job from your planner but stores the data for later use in reporting and cost calculations. If you do not wish to store this job data then simply delete the job."
- **Behavior**:
  1. Creates job snapshot for archiving
  2. Removes ESI data links
  3. Archives job in Firebase
  4. Deletes job from active planner
  5. Removes from job arrays
  6. Navigates back to job planner
  7. Shows success notification
- **Purpose**: Store job data for historical analysis while cleaning up active planner

## Button Context

### Group Jobs
When job is in a group:
- **Sell Group Job**: Available if no parent jobs
- **Mark As Complete**: Available for completion tracking
- **Pass Build Costs**: Available if has parent jobs
- **Archive Job**: Hidden (groups handle archiving differently)

### Standalone Jobs
When job is not in a group:
- **Sell Group Job**: Hidden
- **Mark As Complete**: Hidden
- **Pass Build Costs**: Available if has parent jobs
- **Archive Job**: Available when logged in

### Parent Jobs
When job has parent jobs:
- **Pass Build Costs**: Available to send costs upstream
- **Sell Group Job**: Hidden (parent jobs can't be marked for sale)

## Using the Buttons

### Marking for Sale
1. Ensure job is in a group
2. Verify job has no parent jobs
3. Click "Ready For Sale" button
4. Job status advances and ready flag is set
5. Job appears in selling stage

### Passing Build Costs
1. Ensure job has parent jobs
2. Verify all costs are finalized
3. Click "Send Build Costs" button
4. Costs are sent to all parent jobs
5. Parent jobs update with new material costs
6. If in group, job is also marked complete

### Marking Complete
1. Ensure job is in a group
2. Verify job is finished
3. Click "Mark As Complete" button
4. Job is added to group's complete set
5. Status tracked for group workflows

### Archiving Jobs
1. Ensure you are logged in
2. Verify job is not in a group
3. Review all costs are finalized
4. Click "Archive Job" button
5. Job is archived and removed from planner
6. Data stored for historical analysis

## Best Practices

### Before Archiving
- Verify all costs are complete
- Check extras are added
- Review build stats for accuracy
- Ensure no pending actions needed

### Cost Passing
- Finalize all costs before passing
- Verify parent jobs are ready
- Check costs are reasonable
- Review parent job updates

### Group Workflows
- Mark jobs complete as they finish
- Use ready-for-sale for group coordination
- Track completion status
- Coordinate with group members

## Related Documentation

- [Extras Panel](extras%20panel) - Adding final costs
- [Build Stats Panel](build%20stats%20panel) - Reviewing final statistics
- [Complete Stage Overview](../complete) - General complete stage information
