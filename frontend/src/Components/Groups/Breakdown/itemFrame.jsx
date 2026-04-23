import { useEffect, useState } from "react";
import ContentPanel from "../../../Styled Components/Paper/ContentPanel";
import { Avatar, Box, Divider, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useUsersStore from "../../../Zustand/usersStore";
import { LARGE_TEXT_FORMAT, SMALL_TEXT_FORMAT } from "../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import { getJobTypeAccentColor } from "../../../Functions/Helper/jobTypeDividerColor";

export default function ItemBreakdownFrame({ groupJobs = [], outputJob = null }) {
    const theme = useTheme();
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);
    const [error, setError] = useState(null);
    const [relatedJobs, setRelatedJobs] = useState([]);
    const [breakdownStats, setBreakdownStats] = useState({
        totalRawMaterialPurchaseCost: 0,
        totalInstallCosts: 0,
        totalExtrasCosts: 0,
        totalInventionCosts: 0,
        totalInvolvedCharacters: 0
    });

    const groupObject = useUsersStore.getState().jobData.actions.getActiveGroupObject();

    useEffect(() => {
        async function getRelatedJobs() {
            try {
                if (!groupObject) {
                    throw new Error("Group object not found");
                }
                const matchedJobs = await groupObject.getJobIDsForOutputJob(outputJob);

                let totalRawMaterialPurchaseCost = 0;
                let totalInstallCosts = 0;
                let totalExtrasCosts = 0;
                let totalInventionCosts = 0;
                let totalInvolvedCharacters = 0;

                for (const job of matchedJobs) {
                    totalRawMaterialPurchaseCost += job.totalRawMaterialPurchaseCost();
                    totalInstallCosts += job.build.costs.installCosts;
                    totalExtrasCosts += job.build.costs.extrasTotal;
                    totalInventionCosts += job.build.costs.inventionCosts;
                    totalInvolvedCharacters += job.calculateTotalInvolvedCharacters().numberOfUniqueCharacters;
                }

                setBreakdownStats({
                    totalRawMaterialPurchaseCost,
                    totalInstallCosts,
                    totalExtrasCosts,
                    totalInventionCosts,
                    totalInvolvedCharacters
                });
                setRelatedJobs(matchedJobs);
            } catch (error) {
                setIsError(true);
                setError(error);
            } finally {
                setIsLoading(false);
            }
        }
        getRelatedJobs();
    }, []);

    return (
        <ContentPanel
            componentName="Item Breakdown Frame"
            paperSx={{ padding: 0, overflow: "hidden", height: "auto", width: "fit-content", flex: "0 0 auto" }}
            isLoading={isLoading}
            isError={isError}
            error={error}
        >
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {outputJob?.itemID != null && (
                        <Avatar
                            src={`https://images.evetech.net/types/${outputJob.itemID}/icon?size=64`}
                            alt={outputJob?.name ?? ""}
                            variant="square"
                            sx={{ width: 40, height: 40, flexShrink: 0 }}
                        />
                    )}
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>{outputJob?.name}</Typography>
                </Box>
                <Divider
                    flexItem
                    sx={{
                        borderBottomWidth: 2,
                        borderBottomColor: getJobTypeAccentColor(theme, outputJob?.jobType),
                    }}
                />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
                        Total Raw Material Purchase Cost: {formatNumberForLocale(breakdownStats.totalRawMaterialPurchaseCost)}
                    </Typography>
                    <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
                        Total Install Costs: {formatNumberForLocale(breakdownStats.totalInstallCosts)}
                    </Typography>
                    <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
                        Total Extras Costs: {formatNumberForLocale(breakdownStats.totalExtrasCosts)}
                    </Typography>
                    <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
                        Total Invention Costs: {formatNumberForLocale(breakdownStats.totalInventionCosts)}
                    </Typography>
                    <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
                        Total Involved Characters: {formatNumberForLocale(breakdownStats.totalInvolvedCharacters, { max: 0 })}
                    </Typography>
                </Box>
            </Box>
        </ContentPanel>
    )
}