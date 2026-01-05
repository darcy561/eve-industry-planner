import React from "react";
import { IndustryESICardActive } from "./Api Job Card/manufacturingCardActive";
import { IndustryESICardComplete } from "./Api Job Card/manufacturingCardComplete";
import { MeResearchESICardActive } from "./Api Job Card/meResearchActive";
import { TeResearchESICardActive } from "./Api Job Card/teResearchActive";
import { ReactionESICardComplete } from "./Api Job Card/reactionCardComplete";
import { ReactionESICardActive } from "./Api Job Card/reactionCardActive";
import { BpCopyESICardActive } from "./Api Job Card/bpCopyActive";
import { InventionESICardActive } from "./Api Job Card/InventionCardActive";

export function useApiJobCardSorter(job) {
  const blankReturnObject = {
    apiCardContent: <ClassicAPIJobCardPlaceholder />,
    jobCardText: "",
  };

  const jobLocationText = job.is_corporation ? "Corp Job" : "Job";

  switch (job.activity_id) {
    case 1:
      switch (job.status) {
        case "active":
          return {
            apiCardContent: <IndustryESICardActive job={job} />,
            jobCardText: `ESI Manufacturing ${jobLocationText}`,
          };
        case "delivered":
          return {
            apiCardContent: <IndustryESICardComplete job={job} />,
            jobCardText: `ESI Manufacturing ${jobLocationText}`,
          };
        default:
          return blankReturnObject;
      }
    case 3:
      switch (job.status) {
        case "active":
          return {
            apiCardContent: <TeResearchESICardActive job={job} />,
            jobCardText: `ESI TE Research ${jobLocationText}`,
          };
        default:
          return blankReturnObject;
      }
    case 4:
      switch (job.status) {
        case "active":
          return {
            apiCardContent: <MeResearchESICardActive job={job} />,
            jobCardText: `ESI ME Research ${jobLocationText}`,
          };

        default:
          return blankReturnObject;
      }
    case 5:
      switch (job.status) {
        case "active":
          return {
            apiCardContent: <BpCopyESICardActive job={job} />,
            jobCardText: `ESI BP Copying ${jobLocationText}`,
          };
        default:
          return blankReturnObject;
      }
    case 8:
      switch (job.status) {
        case "active":
          return {
            apiCardContent: <InventionESICardActive job={job} />,
            jobCardText: `ESI Invention ${jobLocationText}`,
          };
        default:
          return blankReturnObject;
      }
    case 9:
      switch (job.status) {
        case "active":
          return {
            apiCardContent: <ReactionESICardActive job={job} />,
            jobCardText: `ESI Reaction ${jobLocationText}`,
          };
        case "delivered":
          return {
            apiCardContent: <ReactionESICardComplete job={job} />,
            jobCardText: `ESI Reaction ${jobLocationText}`,
          };
        default:
          return blankReturnObject;
      }
    default:
      return blankReturnObject;
  }
}

function ClassicAPIJobCardPlaceholder() {
  return null;
}
