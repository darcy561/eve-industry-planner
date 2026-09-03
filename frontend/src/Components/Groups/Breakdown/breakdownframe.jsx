import { useMemo } from "react";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { Box, Divider, Typography } from "@mui/material";
import { LARGE_TEXT_FORMAT, STANDARD_TEXT_FORMAT } from "../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import useUsersStore from "../../../Zustand/usersStore";
import ItemBreakdownFrame from "./itemFrame";

export default function GroupBreakdownFrame({ groupJobs = [] }) {

    const groupObject = useUsersStore.getState().jobData.actions.getActiveGroupObject();

    const outputJobs = useMemo(() => {
        return groupObject.findOutputJobs(groupJobs);
    }, [groupJobs, groupObject]);

    const {
        totalBoughtMaterialCost,
        totalInstallCosts,
        totalExtrasCosts,
        totalInventionCosts,
        totalInvolvedCharacters,
    } = useMemo(() => {
        let totalBoughtMaterialCost = 0;
        let totalInstallCosts = 0;
        let totalExtrasCosts = 0;
        let totalInventionCosts = 0;
        let totalInvolvedCharacters = 0;
        for (const job of groupJobs) {
            totalBoughtMaterialCost += job.totalBoughtMaterialCost();
            totalInstallCosts += job.totalInstallCost();
            totalExtrasCosts += job.totalExtrasCost();
            totalInventionCosts += job.totalInventionCost();
            totalInvolvedCharacters += job.calculateTotalInvolvedCharacters().numberOfUniqueCharacters;
        }
        return {
            totalBoughtMaterialCost,
            totalInstallCosts,
            totalExtrasCosts,
            totalInventionCosts,
            totalInvolvedCharacters,
        };
    }, [groupJobs]);

    return (
        <ContentPanel
            componentName="Group Breakdown Frame"
            paperSx={{ padding: 0, overflow: "visible", height: "auto" }}
        >
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                <Box sx={{ display: "flex", flexDirection: "column" }}>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                        Total Jobs: {groupJobs.length}
                    </Typography>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                        Total Output Jobs: {outputJobs.length}
                    </Typography>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                        Total Bought Material Cost: {formatNumberForLocale(totalBoughtMaterialCost)}
                    </Typography>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                        Total Install Costs: {formatNumberForLocale(totalInstallCosts)}
                    </Typography>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                        Total Extras Costs: {formatNumberForLocale(totalExtrasCosts)}
                    </Typography>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                        Total Invention Costs: {formatNumberForLocale(totalInventionCosts)}
                    </Typography>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                        Total Involved Characters: {formatNumberForLocale(totalInvolvedCharacters, { max: 0 })}
                    </Typography>
                </Box>
                <Divider flexItem />
                <Box sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 1, alignItems: "flex-start" }}>
                    {outputJobs.map((job) => {
                        return <ItemBreakdownFrame key={job.jobID} groupJobs={groupJobs} outputJob={job} />
                    })}
                </Box>
            </Box>
        </ContentPanel>
    )
}