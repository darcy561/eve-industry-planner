# Production Stats

The Production Stats panel displays detailed production statistics for the current job setup. It shows item quantities, production calculations, parent job requirements, and time estimates to help you understand the scope and feasibility of your production plan.

## Overview

The Production Stats panel provides:
- **Production quantities** at different levels (per run, per job slot, per setup, total job)
- **Parent job integration** showing requirements from parent jobs
- **Time estimates** for job completion
- **Validation indicators** highlighting insufficient production quantities

## Production Quantities

### Items Produced Per Blueprint Run
- **Label**: "Items Produced Per Blueprint Run"
- **Value**: Number of items created in a single blueprint run
- **Calculation**: Based on blueprint and item type
- **Purpose**: Base unit for all production calculations

### Total Items Per Job Slot
- **Label**: "Total Items Per Job Slot"
- **Value**: Items produced by one job slot
- **Calculation**: `Items Per Run × Runs Per Setup`
- **Purpose**: Shows production capacity of a single job slot

### Total Produced Items For Setup
- **Label**: "Total Produced Items For Setup"
- **Value**: Total items produced by the active setup
- **Calculation**: `Items Per Run × Runs × Job Slots`
- **Purpose**: Shows total production from the currently selected setup

### Total Produced Items For Job
- **Label**: "Total Produced Items For Job"
- **Value**: Total items produced across all setups
- **Calculation**: Sum of all setups' production
- **Purpose**: Shows total production capacity of the entire job
- **Color Coding**:
  - **Red**: Insufficient production to meet parent job requirements
  - **Normal**: Sufficient production or no parent requirements

## Parent Job Integration

This section appears when the job has parent jobs (is a child job in a production chain).

### Parent Job(s) Require
- **Label**: "Parent Job(s) Require"
- **Value**: Total quantity required by all parent jobs
- **Calculation**: Sum of material requirements from all parent jobs
- **Purpose**: Shows how many items parent jobs need from this job

### Parents Other Children Produce
- **Label**: "Parents Other Children Produce"
- **Condition**: Only shown when multiple child jobs supply the same parent
- **Value**: Total quantity produced by other child jobs for the same parent
- **Calculation**: Sum of production from sibling child jobs
- **Purpose**: Shows production from other sources, helping determine if this job's production is sufficient
- **Color Coding**:
  - **Red**: Combined production (this job + siblings) is insufficient
  - **Normal**: Combined production meets requirements

### Validation Logic

The panel validates production sufficiency:
- **Requirement Check**: `Total Produced + Siblings' Production >= Parent Requirements`
- **Color Indication**: Red text indicates insufficient production
- **Multiple Parents**: Calculates requirements across all parent jobs

## Time Estimates

### Time Per Job Slot
- **Label**: "Time Per Job Slot"
- **Value**: Estimated time to complete one job slot
- **Format**: Human-readable duration (e.g., "2d 5h 30m")
- **Calculation**: Based on:
  - Blueprint time efficiency (TE)
  - Structure bonuses
  - System index
  - Character skills
- **Purpose**: Helps plan job scheduling and capacity

## Understanding the Statistics

### Production Hierarchy

The panel shows production at multiple levels:

1. **Per Run**: Base production unit
2. **Per Job Slot**: Production from one job slot
3. **Per Setup**: Production from one setup configuration
4. **Total Job**: Production from all setups combined

### Parent Job Requirements

When this job is part of a production chain:

- **Required Quantity**: How many items parent jobs need
- **Your Production**: How many items this job will produce
- **Sibling Production**: How many items other child jobs produce
- **Validation**: Whether total production meets requirements

### Time Planning

The time estimate helps with:
- **Scheduling**: Planning when jobs will complete
- **Capacity**: Understanding how long structures will be occupied
- **Coordination**: Timing production chains correctly

## Color Coding Guide

### Red Text
Indicates problems or warnings:
- **Total Produced Items**: Insufficient to meet parent requirements
- **Parents Other Children Produce**: Combined production still insufficient

### Normal Text
Indicates normal operation:
- Production meets or exceeds requirements
- No parent job conflicts

## Use Cases

### Planning Production Chains
1. Check "Total Produced Items For Job"
2. Compare to "Parent Job(s) Require"
3. Adjust setups if production is insufficient
4. Consider sibling child jobs if applicable

### Validating Setups
1. Review "Total Produced Items For Setup"
2. Ensure it contributes appropriately to total production
3. Adjust runs or job slots as needed

### Time Management
1. Check "Time Per Job Slot"
2. Multiply by number of job slots for total time
3. Plan material delivery and job scheduling accordingly

## Related Documentation

- [Planning Stage Overview](planning) - General planning stage information
- [Setups](setups) - Configuring job setups that affect production stats
- [Resources Panel](resources) - Viewing material requirements
- [Edit Job Overview](../edit-job) - Complete job editing guide
