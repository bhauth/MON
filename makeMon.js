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
  const fmtKey = `'${key}'`;

  if (typeof value === "string" && value.includes("\n")) {
    lines.push(`${header}" ${key}`);
    let values = value.split("\n");
    values.pop();
    values.forEach(line => {
      if (line.startsWith("#")) {
        const hashes = line.match(/^#+/)[0].length;
        lines.push("#".repeat(hashes + level + 1) + line.slice(hashes));
      } else lines.push(line);
    });
  } else if (Array.isArray(value)) {
    lines.push(`${header} ${key}`);
    processArray(value, level + 1, lines, indent);
  } else if (typeof value === "object" && value !== null) {
    lines.push(`${header} ${key}`);
    for (const [k, v] of Object.entries(value)) {
      if (typeof v !== "object" || v === null) {
        lines.push(`${"#".repeat(level + 2)} ${k}`);
        lines.push(`${indent}${formatValue(v)}`);
      } else if (isSimple(v)) {
        lines.push(`${"#".repeat(level + 2)} ${k}`);
        for (const [subK, subV] of Object.entries(v)) {
          lines.push(`${indent}${fmtKey.replace(key, subK)} = ${formatValue(subV)}`);
        }
      } else {
        sectionToMON(k, v, level + 1, lines, indent);
      }
    }
  } else {
    const formatted = formatValue(value);
    lines.push(`${header} ${key}`);
    lines.push(`${indent}${formatted}`);
  }
}

function handleItem(item, level, lines, indent, index = 0) {
  if (typeof item !== "object" || item === null) {
    lines.push(`${indent}- ${formatValue(item)}`);
  } else if (isSimple(item)) {
    lines.push(`${indent}-`);
    for (const [k, v] of Object.entries(item)) {
      const fmtKey = `'${k}'`;
      lines.push(`${indent.repeat(2)}${fmtKey} = ${formatValue(v)}`);
    }
  } else if (Array.isArray(item)) {
    lines.push(`${"#".repeat(level + 1)} ${index}`);
    processArray(item, level + 1, lines, indent);
  } else {
    for (const [k, v] of Object.entries(item)) {
      sectionToMON(k, v, level, lines, indent);
    }
  }
}

function processArray(array, level, lines, indent) {
  array.forEach((item, index) => handleItem(item, level, lines, indent, index));
}

function isSimple(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.values(value).every(v => typeof v !== "object" || v === null);
}

function formatValue(value) {
  let type = typeof value;
  return type === "string" ? `"${value}"`
    : value === null || type === "boolean" || type === "number" ? String(value)
    : Array.isArray(value) ? `[${value.map(formatValue).join(", ")}]`
    : (() => { throw new Error(`Unsupported type: ${type}`) })();
}