# Blueprint Settings

The Blueprint Settings section allows you to configure default values for blueprints and control how the application handles blueprint-related calculations and job building.

## Default Material Efficiency

### Default Material Efficiency Value

**Dropdown:** Select the default Material Efficiency (ME) value

This setting determines the default Material Efficiency level that will be applied to new blueprints when they're added to jobs. Material Efficiency reduces the amount of materials required to build items.

Available options typically range from ME 0 to ME 10, representing the number of research levels completed on the blueprint.

**How it works:**
- Higher ME values reduce material costs
- Each ME level reduces material requirements by a percentage
- This default is applied to new blueprints but can be overridden per blueprint

## Job Recalculation

### Automatically Recalculate Jobs

**Toggle:** Enable/Disable automatic job recalculation

When enabled, jobs will automatically recalculate material requirements and costs when:
- Blueprint settings change
- Market prices update
- Structure bonuses are modified
- Other relevant settings are adjusted

- **Enabled:** Jobs recalculate automatically when relevant settings change
- **Disabled:** Manual recalculation is required

## Blueprint Filtering

### Ignore Items Without Blueprints

**Toggle:** Enable/Disable ignoring items without blueprints

When enabled, items that don't have associated blueprints will be excluded from automatic job building. This is useful for focusing on items you can actually manufacture.

- **Enabled:** Items without blueprints are excluded from automatic job building
- **Disabled:** All items are considered for job building

## Materials To Ignore

### Excluded Materials List

**Search Field:** Add materials to exclude from automatic job building

This feature allows you to specify materials that should be excluded when the application automatically builds jobs. This is useful for:
- Materials you prefer to buy rather than manufacture
- Items that are difficult or expensive to produce
- Materials you want to handle manually

**How to use:**
1. Use the search field to find the material you want to exclude
2. Select the material from the search results
3. The material will be added to the excluded materials list
4. Remove materials by clicking the delete icon on their chip

**Important Notes:**
- Materials in this list are excluded from automatic job building
- Any child jobs these materials might generate are also skipped
- Excluded materials can still be added manually to jobs if needed
- The list shows material names with icons for easy identification

### Managing Excluded Materials

The excluded materials are displayed as chips below the search field. Each chip shows:
- Material name
- Material icon
- Delete button to remove from the list

## How Settings Are Saved

- **Material Efficiency and Toggles:** Saved immediately when changed
- **Excluded Materials:** Saved immediately when added or removed
- All settings are synced across all your devices

## Best Practices

1. **Set Appropriate ME Defaults:** Choose an ME level that matches your typical blueprint research level
2. **Use Automatic Recalculation:** Keep this enabled for the most up-to-date job calculations
3. **Curate Excluded Materials:** Regularly review and update your excluded materials list
4. **Consider Your Workflow:** Adjust settings based on whether you prefer to buy or manufacture materials

## Related Documentation

- [Settings Overview](../settings)
- [Job Settings](job)
- [Custom Structures](custom%20structures)

