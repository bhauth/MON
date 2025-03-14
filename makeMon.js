export function objToMon(json, options) {
  const indentLevel = options.indent || 2;
  const indent = " ".repeat(indentLevel);
  const lines = [];
  let first = true;

  for (const [key, value] of Object.entries(json || {})) {
    if (first) first = false;
    else lines.push("");
    sectionToMON(key, value, 0, lines, indent);
  }
  return lines.join("\n");
}

function makeHeader(level) {
  return "#".repeat(level + 1);
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function sectionToMON(key, value, level, lines, indent) {
  const header = makeHeader(level);
  const fmtKey = `'${key}'`;

  if (typeof value === "string" && value.includes("\n")) {
    lines.push(`${header}" ${key}`);
    let values = value.split("\n");
    values.pop();
    values.forEach(line => {
      if (line.startsWith("#")) {
        const hashes = line.match(/^#+/)[0].length;
        lines.push(makeHeader(level + hashes) + line.slice(hashes));
      } else lines.push(line);
    });
  } else if (Array.isArray(value)) {
    lines.push(`${header} ${key}`);
    processArray(value, level + 1, lines, indent);
  } else if (isObject(value)) {
    lines.push(`${header} ${key}`);
    for (const [k, v] of Object.entries(value)) {
      if (!isObject(v)) {
        lines.push(`${makeHeader(level + 1)} ${k}`);
        lines.push(`${indent}${formatValue(v)}`);
      } else if (isSimple(v)) {
        lines.push(`${makeHeader(level + 1)} ${k}`);
        formatSimpleObject(v, indent, lines);
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
  if (handleSimpleItem(item, indent, lines)) return;
  if (Array.isArray(item)) {
    processArray(item, level, lines, indent);
  } else {
    for (const [k, v] of Object.entries(item)) {
      sectionToMON(k, v, level, lines, indent);
    }
  }
}

function processArray(array, level, lines, indent) {
  array.forEach((item, index) => {
    if (handleSimpleItem(item, indent, lines)) return;
    lines.push(`${makeHeader(level)} ${index}`);
    handleItem(item, level + 1, lines, indent);
  });
}

function handleSimpleItem(item, indent, lines) {
  if (!isObject(item)) {
    lines.push(`${indent}- ${formatValue(item)}`);
    return true;
  } else if (isSimple(item)) {
    lines.push(`${indent}-`);
    formatSimpleObject(item, indent.repeat(2), lines);
    return true;
  }
  return false;
}

function formatSimpleObject(obj, indentLevel, lines) {
  for (const [k, v] of Object.entries(obj)) {
    const fmtKey = `'${k}'`;
    lines.push(`${indentLevel}${fmtKey} = ${formatValue(v)}`);
  }
}

function isSimple(value) {
  return isObject(value) && !Array.isArray(value) &&
    Object.values(value).every(v => !isObject(v));
}

function formatValue(value) {
  let type = typeof value;
  return type === "string" ? `"${value}"`
    : value === null || type === "boolean" || type === "number" ? String(value)
    : Array.isArray(value) ? `[${value.map(formatValue).join(", ")}]`
    : (() => { throw new Error(`Unsupported type: ${type}`) })();
}
