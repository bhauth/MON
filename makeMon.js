export function objToMon(json, options) {
  const indentLevel = options.indent || 2;
  const indent = " ".repeat(indentLevel);
  const lines = [];
  
  sectionToMon("", json || {}, '', lines, indent);
  return lines.join("\n");
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function pushHeading(lines, header, key) {
  lines.push(`${header} ${key}${key.includes('.') ? '.' : ''}`);
}

function sectionToMon(key, value, header, lines, indent) {
  if (typeof value === "string" && value.includes("\n")) {
    pushHeading(lines, header + '"', key);
    let values = value.split("\n");
    values.pop();
    values.forEach(line => {
      if (line[0] === "#") {
        lines.push(header + line);
      } else lines.push(line);
    });
  } else {
    if (header) {
      if (header === '#' && lines.length) { lines.push(''); }
      pushHeading(lines, header, key);
      }
    if (Array.isArray(value)) {
      processArray(value, header + '#', lines, indent);
    } else if (isObject(value)) {
      header += '#';
      for (const [k, v] of Object.entries(value)) {
        if (!isObject(v)) {
          pushHeading(lines, header, k);
          lines.push(`${indent}${formatValue(v)}`);
        } else if (isSimple(v)) {
          pushHeading(lines, header, k);
          formatSimpleObject(v, indent, lines);
        } else {
          sectionToMon(k, v, header, lines, indent);
        }
      }
    } else {
      const formatted = formatValue(value);
      lines.push(`${indent}${formatted}`);
    }
  }
}

function handleItem(item, header, lines, indent) {
  if (handleSimpleItem(item, indent, lines)) return;
  if (Array.isArray(item)) {
    processArray(item, header, lines, indent);
  } else {
    for (const [k, v] of Object.entries(item)) {
      sectionToMon(k, v, header, lines, indent);
    }
  }
}

function processArray(array, header, lines, indent) {
  for (let item of array) {
    if (handleSimpleItem(item, indent, lines)) continue;
    pushHeading(lines, header, '[]');
    handleItem(item, header + '#', lines, indent);
  }
}

function handleSimpleItem(item, indent, lines) {
  if (!isObject(item)) {
    lines.push(`${indent}- ${formatValue(item)}`);
    return true;
  } else if (isSimple(item)) {
    lines.push(`${indent}-`);
    formatSimpleObject(item, indent + indent, lines);
    return true;
  }
  return false;
}

function formatSimpleObject(obj, indentLevel, lines) {
  for (const [k, v] of Object.entries(obj)) {
    lines.push(`${indentLevel}${`'${k}'`} = ${formatValue(v)}`);
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
