import DOMPurify from "dompurify";

export function sanitizeTemplateText(value) {
  return DOMPurify.sanitize(String(value ?? ""), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  }).trim();
}

export function makeTemplateFilter({ getOutputSearchText } = {}) {
  return (options, state) => {
    const q = state.inputValue.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const name = (o.name || "").toLowerCase();
      const desc = (o.description || "").toLowerCase();
      const outputText = (getOutputSearchText?.(o) || "").toLowerCase();
      return (
        name.includes(q) ||
        desc.includes(q) ||
        outputText.includes(q) ||
        (o.templateID || "").toLowerCase().includes(q)
      );
    });
  };
}
