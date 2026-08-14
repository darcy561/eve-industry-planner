# Archive Jobs Panel

The Archive Jobs Panel displays historical data from previously completed and archived jobs for the same item type. It provides valuable insights into past production performance, helping you make informed decisions about current job planning based on actual results from previous runs.

## Overview

The Archive Jobs Panel provides:
- Historical job data from archived jobs of the same item type
- Performance metrics including costs, production quantities, and profitability
- Comparative analysis to help evaluate current job plans against past results
- Child job tracking showing which archived jobs were part of production chains

## Panel Visibility

- Requirement: Only visible to logged-in users
- Data Source: Archived planner jobs from your job history
- Matching: Shows data for jobs matching the current item type (itemID)

## Column Headers

The panel displays the following columns (layout varies by job type):

### Total Items Produced
- Display: Only visible on larger screens (hidden on mobile)
- Content: Total quantity of items produced in the archived job
- Format: Locale-formatted number with thousand separators
- Purpose: Shows production scale of past jobs

### Total Job Cost
- Display: Always visible
- Content: Total cost of the archived job
- Format: Locale-formatted currency
- Calculation: Includes materials, installation costs, and extras
- Purpose: Shows actual total expenditure

### Job Cost Per Item
- Display: Always visible
- Content: Average cost per item produced
- Format: Locale-formatted currency
- Calculation: Total Job Cost ÷ Total Items Produced
- Purpose: Shows unit cost efficiency

### Profit/Loss
- Display: 
  - Always visible for reaction jobs
  - Hidden on mobile for manufacturing jobs
  - Always visible on larger screens
- Content: Profit or loss from the archived job
- Format: Locale-formatted currency
- Tooltip: "Jobs without any sales data will always display 0"
- Purpose: Shows profitability of past production
- Note: Displays 0 if no sales data was recorded

### Child Job
- Display: Only visible on larger screens (hidden on mobile)
- Content: Icon indicating if the job was a child job
- Icons:
  - Green checkmark (✓): Job was a child job (used to construct parent items)
  - Red X (✗): Job was not a child job (standalone production)
- Tooltip: "Indicates whether this job had a parent that it was used to construct"
- Purpose: Identifies jobs that were part of production chains

## Archive Data Rows

Each archived job is displayed as a row showing all the metrics above. Multiple archived jobs for the same item type will be displayed as separate rows, allowing you to compare different production runs.

### Data Source

Archive data comes from:
- Job Snapshots: Data captured when jobs were archived
- Item Matching: Only shows jobs for the same item type (itemID)
- Historical Records: Past completed jobs that have been archived

### Data Display

- Multiple Entries: If multiple archived jobs exist, each is shown as a separate row
- Chronological Order: Jobs are typically displayed in order of completion
- Complete Metrics: Each row shows all available statistics

## Empty State

When no archived data exists:
- Message: "No Archived Job Data To Display"
- Condition: No archived jobs found matching the current item type
- Meaning: This is the first time planning this item, or previous jobs haven't been archived yet

## Responsive Layout

The panel adapts to screen size:

### Mobile View
- Hidden Columns: Total Items Produced, Child Job indicator
- Visible Columns: Total Job Cost, Job Cost Per Item, Profit/Loss (reaction only)

### Desktop View
- All Columns: All columns are visible
- Full Information: Complete historical data is displayed

## Using Archive Data

### Cost Comparison
1. Review "Total Job Cost" from archived jobs
2. Compare to estimated costs in current job planning
3. Identify cost variations and their causes
4. Adjust current job plans based on historical costs

### Efficiency Analysis
1. Check "Job Cost Per Item" across multiple archived jobs
2. Identify trends in unit costs
3. Determine if efficiency is improving or declining
4. Use insights to optimize current job setups

### Profitability Review
1. Examine "Profit/Loss" values from past jobs
2. Understand profitability patterns
3. Identify which production runs were most profitable
4. Apply lessons to current job planning

### Production Chain Context
1. Use "Child Job" indicator to understand job context
2. Identify which jobs were part of production chains
3. Compare standalone vs. child job performance
4. Plan current jobs with production chain awareness

## Data Limitations

### Sales Data Dependency
- Profit/Loss: Requires sales data to be meaningful
- Zero Values: Jobs without sales data show 0 for profit/loss
- Tooltip Warning: Tooltip explains when profit/loss will be 0

### Historical Accuracy
- Snapshot Data: Based on data captured at archive time
- Market Changes: Past costs may not reflect current market conditions
- Setup Differences: Past jobs may have used different setups

## Best Practices

### When Planning New Jobs
1. Review Archive Data: Check historical performance before planning
2. Compare Setups: Compare current setup estimates to past results
3. Learn from History: Identify what worked well in past jobs
4. Avoid Mistakes: Learn from past jobs that had issues

### For Production Chains
1. Check Child Job Status: Understand which past jobs were part of chains
2. Compare Contexts: Compare standalone vs. child job performance
3. Plan Accordingly: Use insights when planning new production chains

### Cost Optimization
1. Track Trends: Monitor how costs change over time
2. Identify Improvements: Look for jobs with better cost efficiency
3. Replicate Success: Apply successful strategies to new jobs

## Related Documentation

- [Planning Stage Overview](planning) - General planning stage information
- [Material Prices](material%20prices) - Comparing current estimated costs
- [Production Stats](production%20stats) - Understanding current production estimates
- [Edit Job Overview](../edit%20job) - Complete job editing guide
