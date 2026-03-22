import { jobTypes } from "../../Context/defaultValues";

/**
 * Returns a theme palette color string for visual accents (e.g. dividers, chips) by job type.
 * Uses the same industry colors as elsewhere (manufacturing, reaction, PI, base material).
 * Unknown or missing job types fall back to `theme.palette.primary.main` (not divider), so this
 * helper stays suitable for general UI accents.
 *
 * @param {object} theme - MUI theme
 * @param {number | undefined | null} jobType
 * @returns {string}
 */
export function getJobTypeAccentColor(theme, jobType) {
  switch (jobType) {
    case jobTypes.manufacturing:
      return theme.palette.manufacturing.main;
    case jobTypes.reaction:
      return theme.palette.reaction.main;
    case jobTypes.pi:
      return theme.palette.pi.main;
    case jobTypes.baseMaterial:
      return theme.palette.baseMat.main;
    case jobTypes.invention:
      return theme.palette.warning.main;
    case jobTypes.reprocessing:
      return theme.palette.primary.main;
    default:
      return theme.palette.primary.main;
  }
}
