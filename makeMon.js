function jsonToMON(json, options = { indentDepth: 2 }) {
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
  const fmtKey = key.includes(" ") || key === "null" ? `'${key}'` : key;
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
    const allSimpleObjects = value.every(v => typeof v === "object" && v && !Array.isArray(v) && 
      Object.values(v).every(x => typeof x !== "object" || x === null));
    lines.push(isSimpleArray ? `${indent}${fmtKey} = ${formatValue(value)}` : `${header} ${key}`);
    if (!isSimpleArray) {
      value.forEach(item => {
        if (typeof item === "object" && item && !Array.isArray(item)) {
          if (allSimpleObjects) {
            lines.push("-");
            for (const [k, v] of Object.entries(item)) {
              lines.push(`${indent}${k} = ${formatValue(v)}`);
            }
          } else {
            lines.push(`${header} ${key}.[]`);
            for (const [k, v] of Object.entries(item)) {
              sectionToMON(k, v, level + 1, lines, indent);
            }
          }
        } else if (item !== null) {
          lines.push(`- ${formatValue(item)}`);
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

export function objToMon(obj, options = {}) {
  return jsonToMON(obj, options);
}
