# Information Panel

The Information Panel provides a quick overview of key cost metrics for the job during the building stage. It displays total material costs, installation costs, and cost per item in an easy-to-read format.

## Overview

The Information Panel provides:
- **Total material cost** showing all material purchase expenses
- **Total install costs** from linked ESI industry jobs
- **Cost per item** calculation for unit cost analysis
- **Quick reference** for cost tracking during active manufacturing

## Panel Display

### Total Material Cost
- **Label**: "Total Material Cost"
- **Value**: Sum of all material purchase costs
- **Format**: Locale-formatted currency
- **Calculation**: Sum of all `purchasedCost` values from all materials
- **Purpose**: Shows total expenditure on materials

### Total Install Costs
- **Label**: "Total Install Costs"
- **Value**: Sum of installation fees from linked ESI jobs
- **Format**: Locale-formatted currency
- **Calculation**: Sum of installation costs from all linked industry jobs
- **Purpose**: Shows total installation fees paid for manufacturing

### Total Cost Per Item
- **Label**: "Total Cost Per Item"
- **Value**: Average cost per produced item
- **Format**: Locale-formatted currency
- **Calculation**: `(Total Material Cost + Total Install Costs) ÷ Total Items Produced`
- **Purpose**: Shows unit cost efficiency including both materials and installation

## Layout

### Responsive Design
- **Mobile**: Full width, stacked vertically
- **Desktop**: Three-column layout showing all metrics side-by-side
- **Spacing**: Consistent margins and padding

## Using the Panel

### Cost Monitoring
1. Review total material cost to verify purchasing expenses
2. Check total install costs from linked ESI jobs
3. Monitor cost per item to track efficiency
4. Compare costs as jobs are linked and completed

### Quick Reference
- Use during building to verify costs are being tracked correctly
- Reference when linking new ESI jobs to see cost impact
- Review before moving to complete stage

## Related Documentation

- [Tab Panel](tab%20panel) - Linking and managing ESI jobs
- [Building Stage Overview](../building) - General building stage information
