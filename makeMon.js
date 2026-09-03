const KEYVAL = "K";
const TEXT_BLOCK_MIN = 80;

export function objToMon(json, options) {
  const unit = " ".repeat((options && options.indent) || 2);
  const root = json === undefined ? {} : json;
  const meta = new Map();
  scanMeta(root, meta);
  const lines = [];
  emitValue(root, 0, meta, lines, unit, true);
  return lines.join("\n");
}

// memoize: depth of the deepest array OR 'K' if contains key-value
function scanMeta(node, meta) {
  if (Array.isArray(node)) {
    let depth = 0;
    let keyval = false;
    for (const e of node) {
      const m = scanMeta(e, meta);
      if (m === KEYVAL) keyval = true;
      else if (Array.isArray(e) && 1 + m > depth) depth = 1 + m;
    }
    const m = keyval ? KEYVAL : depth;
    meta.set(node, m);
    return m;
  }
  if (node !== null && typeof node === "object") {
    for (const v of Object.values(node)) scanMeta(v, meta);
    meta.set(node, KEYVAL);
    return KEYVAL;
  }
  meta.set(node, 0);
  return 0;
}

function emitValue(v, level, meta, lines, unit, isRoot) {
  if (Array.isArray(v)) emitArray(v, level, meta, lines, unit, isRoot);
  else if (isObj(v)) emitObject(v, level, meta, lines, unit);
  else if (isRoot && wantsTextBlock(v)) {
    pushTextBlock("", v, 1, lines);
  } else {
    lines.push((isRoot ? "" : unit) + formatScalar(v));
  }
}

function emitObject(obj, level, meta, lines, unit) {
  const at = level === 0 ? "" : unit;
  const entries = Object.entries(obj);
  for (const [k, v] of entries) {
    if (isObj(v)) continue;
    if (wantsTextBlock(v)) {
      pushTextBlock(k, v, level + 1, lines);
    } else {
      lines.push(`${at}${kvpKey(k)} = ${formatScalar(v)}`);
    }
  }
  for (const [k, v] of entries) {
    if (!isObj(v)) continue;
    pushHeader(k, level + 1, lines, false);
    emitValue(v, level + 1, meta, lines, unit, false);
  }
}

function emitArray(arr, level, meta, lines, unit, isRoot) {
  const at = isRoot ? "" : unit;
  if (!arr.length) {
    lines.push(at + "[]");
    return;
  }
  let rowPos = true;
  for (const e of arr) {
    const text = wantsTextBlock(e);
    if (!rowPos || text || !isRow(e, meta)) {
      rowPos = false;
      pushHeader("[]", level + 1, lines, text);
      if (text) pushTextLines(e, level + 1, lines);
      else emitValue(e, level + 1, meta, lines, unit, false);
    } else if (Array.isArray(e)) {
      lines.push(`${at}- ${rowBody(e)}`);
    } else {
      lines.push(`${at}- ${formatScalar(e)}`);
    }
  }
}

function isRow(e, meta) {
  if (Array.isArray(e)) return meta.get(e) === 0;  // flat array: comma-row form
  return !isObj(e);
}

function rowBody(e) {
  if (e.length === 0) return "[]";
  if (e.length === 1) return `[${formatScalar(e[0])}]`;
  return e.map(x => formatScalar(x)).join(", ");
}

function pushTextBlock(name, s, level, lines) {
  pushHeader(name, level, lines, true);
  pushTextLines(s, level, lines);
}

function pushTextLines(s, level, lines) {
  for (const l of s.split("\n")) {
    lines.push(l.startsWith("#") ? "#".repeat(level) + l : l);
  }
  lines.afterText = true;
}

function pushHeader(name, level, lines, text) {
  if (name.includes("\n") || name.includes(" : ")) {
    throw new Error(`unusable section name: ${JSON.stringify(name)}`);
  }
  if (level === 1 && lines.length && !lines.afterText) lines.push("");
  lines.afterText = false;
  let h = "#".repeat(level) + (text ? '"' : "") + " ";
  if (/^["/=;:>]/.test(name)) h += " ";
  h += name.includes(".") ? name + "." : name;
  lines.push(h);
}

function kvpKey(k) {
  if (/^[a-zA-Z_][^=\s]*$/.test(k) && k !== "true" && k !== "false" && k !== "null") return k;
  if (k.includes("'") || k.includes("\n")) {
    throw new Error(`key cannot be quoted: ${JSON.stringify(k)}`);
  }
  return `'${k}'`;
}

function wantsTextBlock(v) {
  if (typeof v !== "string" || v === "") return false;
  if (v.includes('"')) return true;    // quotes can't be escaped inline
  const ls = v.split("\n");
  if (ls.some((l, i) => i > 0 && /^[#\s]/.test(l))) return true;
  return ls.length > 1 && v.length >= TEXT_BLOCK_MIN;
}

function isObj(v) {
  return v !== null && typeof v === "object";
}

function formatScalar(v) {
  const t = typeof v;
  if (t === "string") return `"${v}"`;
  if (t === "number") return numToMon(v);
  if (t === "boolean" || v === null) return String(v);
  throw new Error(`unsupported value type: ${t}`);
}

// expand JSON exponents, eg 1e4
function numToMon(n) {
  const s = String(n);
  if (!Number.isFinite(n))
    return `"${s}"`;
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/.exec(s);
  if (!m) return s;
  const digits = m[2] + (m[3] || "");
  const exp = parseInt(m[4], 10) - (m[3] || "").length;
  if (exp >= 0) return m[1] + digits + "0".repeat(exp);
  const point = digits.length + exp;
  return point > 0
    ? m[1] + digits.slice(0, point) + "." + digits.slice(point)
    : m[1] + "0." + "0".repeat(-point) + digits;
}
