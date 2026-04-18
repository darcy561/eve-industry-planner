# Button Panel

The Button Panel provides action buttons for managing jobs in the selling stage. Currently, it provides the archive job button for storing completed job data after sales are finished.

## Overview

The Button Panel provides:
- **Job archiving** to store job data for historical analysis
- **Cleanup** removing completed jobs from active planner
- **Data preservation** keeping job data for reporting and cost history

## Button Layout

### Button Arrangement
- **Position**: Right-aligned at bottom of selling stage
- **Spacing**: Consistent margins
- **Size**: Small variant buttons

## Available Buttons

### Archive Job Button
- **Label**: "Archive Job"
- **Visibility**: 
  - Only shown when logged in
  - Only shown when job is NOT in a group
- **Function**: Archives job for historical reference
- **Tooltip**: "Removes the job from your planner but stores the data for later use in reporting and cost calculations. If you do not wish to store this job data then simply delete the job."
- **Behavior**:
  1. Creates job snapshot for archiving
  2. Removes ESI data links (orders, jobs, transactions)
  3. Archives job in Firebase database
  4. Deletes job from active planner
  5. Removes from job arrays
  6. Navigates back to job planner
  7. Shows success notification
- **Purpose**: Store job data for historical analysis while cleaning up active planner

## Archiving Process

### Data Preservation
When archiving:
- **Job Snapshot**: Complete job data is saved
- **Cost History**: Build costs preserved for comparison
- **Sales Data**: Transaction and order data stored
- **Historical Reference**: Available for future analysis

### Data Removal
When archiving:
- **Active Planner**: Job removed from active jobs
- **ESI Links**: All ESI data links removed
- **Job Arrays**: Removed from job lists
- **Navigation**: Returns to job planner

### ESI Data Cleanup
- **Orders**: Removed from linked orders
- **Jobs**: Removed from linked jobs
- **Transactions**: Removed from linked transactions
- **Clean State**: ESI data cleared for archiving

## Using the Button

### Archiving Jobs
1. Ensure you are logged in
2. Verify job is not in a group
3. Complete all sales tracking
4. Review final statistics
5. Click "Archive Job" button
6. Job is archived and removed from planner
7. Data stored for historical analysis

## Best Practices

### Before Archiving
- Complete all sales tracking
- Link all transactions
- Review final statistics
- Verify all data is accurate
- Ensure no pending actions

### Data Preservation
- Archive jobs after sales complete
- Keep historical data for analysis
- Use archived data for cost comparisons
- Maintain records for reporting

### Cleanup
- Archive completed jobs regularly
- Keep active planner organized
- Remove finished jobs
- Maintain clean workspace

## Related Documentation

- [Sales Stats Panel](sales%20stats%20panel) - Reviewing final statistics
- [Selling Stage Overview](../selling) - General selling stage information
