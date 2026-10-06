import { Typography } from "@mui/material";
import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import { jobTypes } from "../../../../../../Context/defaultValues";
import { countOf } from "../../../../../../Functions/Helper/numberParser";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import { useBlueprintLibrary } from "./useBlueprintLibrary";
import BlueprintRows from "./blueprintRows";
import FormulaRows from "./formulaRows";

function LibraryBody({ isReaction, library }) {
  const empty = isReaction
    ? library.formulaHolders.length === 0
    : library.blueprints.length === 0;

  if (empty) {
    return (
      <Typography variant="body2" color="text.secondary">
        {isReaction
          ? "No formulas held for this reaction."
          : "No blueprints held for this item."}
      </Typography>
    );
  }
  return isReaction ? (
    <FormulaRows holders={library.formulaHolders} />
  ) : (
    <BlueprintRows blueprints={library.blueprints} />
  );
}

/** The blueprints, or for a reaction the formulas, the reader holds for this job. */
export function BlueprintLibraryPanel() {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const jobType = useJobDraft((job) => job.jobType);

  if (!isLoggedIn) return null;
  return <Library isReaction={jobType === jobTypes.reaction} />;
}

function Library({ isReaction }) {
  const library = useBlueprintLibrary();
  const count = isReaction
    ? library.formulaHolders.reduce(
        (total, holder) => total + holder.formulas,
        0,
      )
    : library.blueprints.filter((blueprint) => !blueprint.status).length;

  return (
    <AppShellPanel
      title={isReaction ? "Formula Library" : "Blueprint Library"}
      componentName="BlueprintLibraryPanel"
      paperSx={{ height: "auto" }}
      isLoading={library.isLoading}
      isError={Boolean(library.error)}
      error={library.error}
      action={
        library.isLoading || count === 0 ? null : (
          <Typography variant="caption" color="text.secondary">
            {isReaction ? countOf(count, "formula") : `${count} free to use`}
          </Typography>
        )
      }
    >
      <LibraryBody isReaction={isReaction} library={library} />
    </AppShellPanel>
  );
}
