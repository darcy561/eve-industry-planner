# Child Job Dialogue

The Child Job Dialogue is a modal window that allows you to manage child job relationships for materials. It provides options to link existing child jobs, create new child jobs, and view currently linked jobs for a specific material.

## Overview

The Child Job Dialogue provides:
- **Available child jobs** list showing jobs that can be linked
- **Linked child jobs** list showing currently connected jobs
- **Job management** to add or remove child job links
- **Material-specific** filtering to show only relevant jobs

## Opening the Dialogue

### Trigger
- **Method**: Click the child jobs avatar on a material card
- **Avatar**: Circular avatar showing number of linked jobs
- **Visibility**: Only shown for buildable materials (manufacturing/reaction)
- **Tooltip**: "Number of child jobs linked, click to add or remove."

### Dialogue Display
- **Type**: Modal dialog window
- **Title**: "Available Child Jobs"
- **Size**: Responsive, adapts to content
- **Padding**: 20px around content

## Dialogue Sections

### Available Child Jobs Section
- **Title**: "Available Child Jobs" (in dialog title)
- **Content**: List of jobs that can be linked to this material
- **Filtering**: 
  - Only shows jobs matching the material's item type
  - Excludes already linked jobs
  - Respects group membership (if job is in a group)
- **Purpose**: Jobs you can link to supply this material

### Linked Child Jobs Section
- **Title**: "Linked Child Jobs" (in content area)
- **Content**: List of jobs currently linked to this material
- **Styling**: Highlighted or distinct from available jobs
- **Purpose**: Shows which jobs are currently supplying this material

## Available Child Jobs

### Job Display
Each available job shows:
- **Job information**: Item name, quantities, status
- **Action buttons**: Options to link the job
- **Filtering**: Only relevant jobs are shown

### Filtering Logic
Jobs are included if:
- **Item matches**: Job produces the same item type as the material
- **Not already linked**: Job is not in the linked jobs list
- **Group membership**: If parent job is in a group, only shows jobs from same group
- **If no group**: Shows all matching jobs from user's job list

### Job Sources
- **User Jobs**: Jobs from your personal job list
- **Group Jobs**: Jobs from the same group (if applicable)
- **Temporary Jobs**: Jobs pending creation/linking

## Linked Child Jobs

### Job Display
Each linked job shows:
- **Job information**: Item name, quantities, status
- **Action buttons**: Options to unlink the job
- **Status**: Indicates the job is currently linked

### Unlinking Jobs
- **Method**: Click unlink/remove button on linked job
- **Behavior**: 
  - Removes job from linked list
  - Job becomes available to link again
  - Material calculations update automatically

## Job Actions

### Linking a Job
1. Review available child jobs list
2. Find the job you want to link
3. Click link/add button on the job
4. Job moves to linked child jobs section
5. Material card updates to show new count
6. Material calculations update

### Unlinking a Job
1. Review linked child jobs list
2. Find the job you want to unlink
3. Click unlink/remove button
4. Job moves to available child jobs section
5. Material card updates to show new count
6. Material calculations update

### Creating New Child Jobs
- **Option**: May be available in the dialogue
- **Function**: Creates a new job for this material
- **Behavior**: 
  - Creates job with appropriate configuration
  - Automatically links to parent job
  - Appears in linked child jobs list

## Dialogue Controls

### Close Button
- **Location**: Bottom of dialogue (Dialog Actions)
- **Label**: "Close"
- **Function**: Closes the dialogue
- **Behavior**: 
  - Saves any changes made
  - Updates material card display
  - Returns focus to main interface

## Material Calculations

### With Linked Child Jobs
When child jobs are linked:
- **Production Total**: Sum of production from all linked jobs
- **Remaining**: Material quantity - child job production
- **Cost Import**: Costs can be imported from completed child jobs
- **Completion**: Material complete when child jobs cover requirement or shortfall is purchased

### Without Child Jobs
When no child jobs are linked:
- **Remaining**: Material quantity - purchased
- **Cost Entry**: Standard purchase cost entry
- **Completion**: Material complete when purchased ≥ required

## Best Practices

### Linking Child Jobs
- Link child jobs early in the planning process
- Verify jobs produce the correct item type
- Check production quantities match requirements
- Link multiple jobs if needed to cover requirements

### Managing Links
- Review linked jobs regularly
- Unlink jobs that are no longer relevant
- Verify job status and completion
- Update links as production plans change

### Group Considerations
- Jobs in groups only see other group jobs
- Consider group membership when planning
- Link jobs within the same group when possible
- Verify group settings match your workflow

## Related Documentation

- [material cards](material%20cards) - Material card interface
- [purchasing data panel](purchasing%20data%20panel) - Overview and statistics
- [Purchasing Stage Overview](../purchasing) - General purchasing stage information
