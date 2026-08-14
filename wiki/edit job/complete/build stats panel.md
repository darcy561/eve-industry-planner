# Build Stats Panel

The Build Stats Panel displays comprehensive statistics about the completed build, including all costs, quantities produced, and efficiency metrics. It provides a complete financial overview before moving to selling or archiving.

## Overview

The Build Stats Panel provides:
- Complete cost breakdown showing all cost components
- Production quantities showing total items built
- Efficiency metrics including cost per item
- Financial summary for profitability analysis

## Statistics Display

### Total Material Cost
- Label: "Total Material Cost"
- Value: Sum of all material purchase costs
- Format: Locale-formatted currency
- Calculation: Sum of all `purchasedCost` values from all materials
- Purpose: Shows total expenditure on materials

### Total Install Costs
- Label: "Total Install Costs"
- Tooltip: "Calculated from linked jobs only, add any unlinked jobs manually as an extra."
- Value: Sum of installation fees from linked ESI jobs
- Format: Locale-formatted currency
- Calculation: Sum of installation costs from all linked ESI industry jobs
- Purpose: Shows total installation fees
- Note: Only includes costs from linked ESI jobs; unlinked jobs should be added as extras

### Total Extras
- Label: "Total Extras"
- Value: Sum of all extra costs
- Format: Locale-formatted currency
- Calculation: Sum of all `extraValue` from extras entries
- Purpose: Shows additional costs not captured elsewhere

### Total Build Cost
- Label: "Total Build Cost"
- Value: Complete build cost including all components
- Format: Locale-formatted currency
- Calculation: `Total Material Cost + Total Install Costs + Total Extras`
- Purpose: Shows complete cost of production

### Total Items Built
- Label: "Total Items Built"
- Value: Total quantity of items produced
- Format: Locale-formatted number (no decimals)
- Calculation: Sum of production from all setups
- Purpose: Shows total production output

### Cost Per Item
- Label: "Cost per item"
- Value: Average cost per produced item
- Format: Locale-formatted currency (rounded to 2 decimals)
- Calculation: `Total Build Cost ÷ Total Items Built`
- Purpose: Shows unit cost efficiency

## Layout

### Display Format
- Two-column layout: Label on left, value on right
- Responsive: Stacks on mobile, side-by-side on desktop
- Spacing: Consistent spacing between rows
- Alignment: Values aligned right for easy comparison

## Using the Panel

### Cost Review
1. Review total material cost to verify purchasing expenses
2. Check total install costs from linked ESI jobs
3. Review total extras for any additional costs
4. Verify total build cost is accurate

### Efficiency Analysis
1. Check total items built matches planning
2. Review cost per item for efficiency
3. Compare to market prices for profitability
4. Use for future job planning

### Final Verification
- Verify all costs are captured
- Check quantities match expectations
- Review cost per item before selling
- Use data for profitability calculations

## Cost Components

### Material Costs
- Includes all material purchase costs
- From purchasing stage entries
- Includes child job costs if applicable
- May include invention costs for T2 items

### Installation Costs
- From linked ESI industry jobs
- Automatically imported when jobs are linked
- Only includes costs from linked jobs
- Unlinked jobs should be added as extras

### Extras Costs
- Additional costs added in complete stage
- Hauling fees, manual installation, etc.
- Categorized for organization
- Manually entered by user

## Best Practices

### Before Archiving
- Verify all costs are included
- Check install costs are complete
- Add any missing costs as extras
- Review totals for accuracy

### Cost Analysis
- Compare to planning estimates
- Review cost per item efficiency
- Analyze cost components
- Use for future planning

### Profitability
- Compare total build cost to market value
- Calculate profit margins
- Review cost per item vs. sale price
- Make informed selling decisions

## Related Documentation

- [Extras Panel](extras%20panel) - Adding additional costs
- [Button Panel](button%20panel) - Job completion actions
- [Complete Stage Overview](../complete) - General complete stage information
