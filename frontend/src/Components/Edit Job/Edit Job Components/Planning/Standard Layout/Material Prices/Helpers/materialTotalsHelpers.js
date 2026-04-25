export function getTotalsDisplayColor({
  comparisonTotal,
  alternateTotal,
  sellTotal,
}) {
  if (comparisonTotal < sellTotal) {
    return alternateTotal < comparisonTotal ? "orange" : "success.main";
  }
  return "error.main";
}
