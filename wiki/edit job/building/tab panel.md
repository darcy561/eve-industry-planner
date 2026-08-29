# Tab Panel

The Tab Panel manages ESI (EVE Swagger Interface) job linking for the building stage. It provides two tabs for viewing available industry jobs that can be linked and managing currently linked jobs with progress tracking.

## Overview

The Tab Panel provides:
- **Available Jobs tab** showing industry jobs from ESI API that match your job
- **Linked Jobs tab** displaying currently connected jobs with progress and status
- **Job linking** to connect planned jobs to actual EVE Online industry jobs
- **Progress tracking** with visual indicators and time remaining
- **Cost import** automatically importing installation costs from linked jobs

## Tab Navigation

### Tab Labels
- **Available Jobs**: Shows count of available jobs (e.g., "3 Available ESI Jobs")
- **Linked Jobs**: Shows linked count vs total needed (e.g., "2/5 Linked ESI Jobs")

### Tab Selection
- **Default Tab**: 
  - Shows Available Jobs if not all jobs are linked
  - Shows Linked Jobs if all jobs are linked
- **Saved Preference**: Remembers last selected tab per job
- **Auto-switching**: May switch tabs based on job status

## Available Jobs Tab

### Job Cards
Each available job is displayed as a card showing:

#### Job Information
- **Blueprint Icon**: Visual representation of blueprint type (original or copy)
- **Character Avatar**: Portrait of character who started the job
- **Corporation Badge**: Corporation logo if job is corporation-owned
- **Runs**: Number of blueprint runs in the job
- **Location**: Facility/structure name where job is running
- **Status**: Job status chip (Active, Delivered, Cancelled)
- **Time Remaining**: Estimated time until completion or "Ready to Deliver"

#### Progress Indicator
- **Progress Bar**: Linear progress bar at top of card
- **Color**: Varies by status
- **Tooltip**: Shows percentage complete on hover
- **Calculation**: Based on start date, end date, and current time

#### Job Linking
- **Click to Link**: Click anywhere on card to link the job
- **Animation**: Card animates out when linked
- **Behaviour**: 
  - Links job to your planned job
  - Imports installation cost automatically
  - Updates linked jobs count
  - Moves job to Linked Jobs tab

#### Link All Button
- **Visibility**: Shown when multiple jobs are available
- **Function**: Links all available jobs at once
- **Restriction**: Disabled if more jobs than available job slots
- **Tooltip**: Explains restriction if applicable

### Empty States

#### No Matching Jobs
- **Message**: "There are no matching industry jobs from the API that match this job."
- **Condition**: No ESI jobs found matching the job configuration
- **Possible Reasons**:
  - Jobs not started in EVE Online yet
  - Jobs don't match blueprint type
  - ESI API data not synced

#### Maximum Jobs Linked
- **Message**: "You have linked the maximum number of jobs from the API, if you need to link more increase the number of job slots used."
- **Condition**: All available job slots are filled
- **Solution**: Increase job slots in setup configuration

## Linked Jobs Tab

### Job Cards
Each linked job displays:

#### Job Information
- **Blueprint Icon**: Visual representation of blueprint type
- **Character Avatar**: Portrait of character who started the job
- **Corporation Badge**: Corporation logo if corporation job
- **Runs**: Number of blueprint runs
- **Location**: Facility/structure name
- **Status**: Job status chip (Active, Delivered, Cancelled)
- **Time Remaining**: Estimated time until completion or "Ready to Deliver"
- **Install Cost**: Installation fee paid for this job

#### Progress Indicator
- **Progress Bar**: Linear progress bar showing completion percentage
- **Real-time Updates**: Updates as time progresses
- **Status Colors**: 
  - **Warning** (yellow): Active jobs
  - **Success** (green): Delivered jobs
  - **Error** (red): Cancelled jobs

#### Job Unlinking
- **Click to Unlink**: Click anywhere on card to unlink the job
- **Animation**: Card animates out when unlinked
- **Behaviour**: 
  - Removes job from linked list
  - Removes installation cost
  - Job becomes available again
  - Updates linked jobs count

### Empty State
- **Message**: "You currently have no industry jobs from the ESI linked to this job."
- **Condition**: No jobs are currently linked
- **Action**: Switch to Available Jobs tab to link jobs

## Job Status

### Active
- **Color**: Warning (yellow/orange)
- **Meaning**: Job is currently running in EVE Online
- **Progress**: Shows time remaining until completion

### Delivered
- **Color**: Success (green)
- **Meaning**: Job has completed and items are ready
- **Progress**: Shows 100% complete

### Cancelled
- **Color**: Error (red)
- **Meaning**: Job was cancelled in EVE Online
- **Progress**: Shows cancelled status

## Job Matching

Jobs are matched based on:
- **Blueprint Type**: Must match the job's blueprint type ID
- **Character**: Matches jobs from your characters
- **Item Type**: Must produce the same item type
- **Status**: Shows active, delivered, and cancelled jobs

## Cost Import

### Automatic Import
When a job is linked:
- **Installation Cost**: Automatically imported from ESI job data
- **Cost Calculation**: Uses actual cost paid in EVE Online
- **Total Update**: Updates total install costs immediately
- **Accuracy**: Uses real data from game, not estimates

### Cost Tracking
- Installation costs are tracked per job
- Total install costs sum all linked jobs
- Costs update if jobs are unlinked
- Historical costs preserved for delivered jobs

## Best Practices

### Linking Jobs
- Link jobs as soon as they start in EVE Online
- Verify job details match your planning
- Check installation costs are reasonable
- Link all jobs to get accurate total costs

### Monitoring Progress
- Regularly check Linked Jobs tab for progress
- Monitor time remaining for active jobs
- Watch for delivered jobs to know when items are ready
- Check for cancelled jobs that need attention

### Cost Management
- Review install costs from linked jobs
- Compare to estimated costs from planning
- Track total costs as jobs complete
- Verify all costs are captured before moving to complete stage

## Related Documentation

- [Information Panel](information%20panel) - Cost overview
- [Building Stage Overview](../building) - General building stage information
