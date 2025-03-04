export function objToMon(json, options = { indentDepth: 2 }) {
  const indent = " ".repeat(options.indentDepth || 0);
  const lines = [];
  let first = true;

  for (const [key, value] of Object.entries(json || {})) {
    if (first) first = false;
    else lines.push("");
    sectionToMON(key, value, 0, lines, indent);
  }
  return lines.join("\n");
}

function sectionToMON(key, value, level, lines, indent) {
  const header = "#".repeat(level + 1);
  let needQuote = key.includes(" ")
    || key === "null" || key === "true" || key === "false";
  const fmtKey = needQuote ? `'${key}'` : key;
  const isRoot = level === 0;

  if (typeof value === "string" && value.includes("\n")) {
    lines.push(`${header}" ${key}`);
    value.split("\n").forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        const hashes = trimmed.match(/^#+/)[0].length;
        lines.push("#".repeat(hashes + level + 1) + trimmed.slice(hashes));
      } else if (trimmed) lines.push(line);
    });
  } else if (Array.isArray(value)) {
    const isSimpleArray = value.every(v => typeof v !== "object" || v === null);
    lines.push(isSimpleArray ? `${indent}${fmtKey} = ${formatValue(value)}` : `${header} ${key}`);
    if (!isSimpleArray) {
      let simpleSoFar = true;
      value.forEach(item => {
        if (typeof item === "object" && item && !Array.isArray(item)) {
          const isComplex = Object.values(item).some(v => typeof v === "object" && v !== null);
          if (isComplex) simpleSoFar = false;
          lines.push(simpleSoFar ? "-" : `${header} ${key}.[]`);
          for (const [k, v] of Object.entries(item)) {
            sectionToMON(k, v, level + 1, lines, indent);
          }
        } else if (item !== null) {
          lines.push(simpleSoFar ? `- ${formatValue(item)}` : `${header} ${key}.[]\n${indent}${formatValue(item)}`);
        }
      });
    }
  } else if (typeof value === "object" && value) {
    lines.push(`${header} ${key}`);
    for (const [k, v] of Object.entries(value)) {
      sectionToMON(k, v, level + 1, lines, indent);
    }
  } else {
    const formatted = formatValue(value);
    lines.push(isRoot ? `${header} ${key}` : `${indent}${fmtKey} = ${formatted}`);
    if (isRoot) lines.push(`${indent}${formatted}`);
  }
}

function formatValue(value) {
  return typeof value === "string" ? `"${value}"`
    : value === null || typeof value === "boolean" || typeof value === "number" ? String(value)
    : Array.isArray(value) ? `[${value.map(formatValue).join(", ")}]`
    : (() => { throw new Error(`Unsupported type: ${typeof value}`) })();
}
