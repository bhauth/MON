const TEXT_BLOCK_MIN = 80;
const numFmt = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 20 });

export function objToMon(json, options) {
  const unit = " ".repeat(options?.indent ?? 2);
  const root = json === undefined ? {} : json;
  const lines = [];
  let afterText = false;

  function emitValue(v, level, isRoot) {
    if (Array.isArray(v)) emitArray(v, level, isRoot);
    else if (isObj(v)) emitObject(v, level);
    else if (isRoot && wantsTextBlock(v)) pushTextBlock("", v, 1);
    else lines.push((isRoot ? "" : unit) + formatScalar(v));
  }

  function emitObject(obj, level) {
    const at = level === 0 ? "" : unit;
    const nested = [];

    for (const [k, v] of Object.entries(obj)) {
      if (isObj(v)) {
        nested.push([k, v]);
      } else if (wantsTextBlock(v)) {
        pushTextBlock(k, v, level + 1);
      } else {
        lines.push(`${at}${kvpKey(k)} = ${formatScalar(v)}`);
      }
    }

    for (const [k, v] of nested) {
      pushHeader(k, level + 1, false);
      emitValue(v, level + 1, false);
    }
  }

  function emitArray(arr, level, isRoot) {
    const at = isRoot ? "" : unit;
    if (!arr.length) return lines.push(at + "[]");

    let rowPos = true;
    for (const e of arr) {
      const text = wantsTextBlock(e);
      let body;

      if (rowPos && !text && (!isObj(e) || (body = getFlatRowBody(e)) !== null)) {
        lines.push(`${at}- ${body !== undefined ? body : formatScalar(e)}`);
      } else {
        rowPos = false;
        pushHeader("[]", level + 1, text);
        if (text) pushTextLines(e, level + 1);
        else emitValue(e, level + 1, false);
      }
    }
  }

  function pushTextBlock(name, s, level) {
    pushHeader(name, level, true);
    pushTextLines(s, level);
  }

  function pushTextLines(s, level) {
    const prefix = "#".repeat(level);
    for (const l of s.split("\n")) {
      lines.push(l.startsWith("#") ? prefix + l : l);
    }
    afterText = true;
  }

  function pushHeader(name, level, text) {
    if (/[\n]| : /.test(name)) {
      throw Error(`unusable section name: ${JSON.stringify(name)}`);
    }
    if (level === 1 && lines.length && !afterText) lines.push("");
    afterText = false;

    let h = "#".repeat(level) + (text ? '" ' : " ");
    if (/^["/=;:>]/.test(name)) h += " ";
    lines.push(h + (name.includes(".") ? name + "." : name));
  }

  emitValue(root, 0, true);
  return lines.join("\n");
}

function getFlatRowBody(arr) {
  if (!Array.isArray(arr)) return null;
  if (!arr.length) return "[]";
  for (let i = 0; i < arr.length; i++) {
    if (isObj(arr[i])) return null;
  }
  return arr.length === 1 ? `[${formatScalar(arr[0])}]` : arr.map(formatScalar).join(", ");
}

function kvpKey(k) {
  if (/^[a-zA-Z_][^=\s]*$/.test(k) && !/^(true|false|null)$/.test(k)) return k;
  if (k.includes("'")) throw Error(`key cannot be quoted: ${JSON.stringify(k)}`);
  return `'${k}'`;
}

function wantsTextBlock(v) {
  if (typeof v !== "string" || !v) return false;
  if (v.includes('"')) return true;
  if (!v.includes("\n")) return false;
  return /\n[#\s]/.test(v) || v.length >= TEXT_BLOCK_MIN;
}

const isObj = v => v !== null && typeof v === "object";

function formatScalar(v) {
  const t = typeof v;
  if (t === "string") return `"${v}"`;
  if (t === "number") return Number.isFinite(v) ? numFmt.format(v) : `"${v}"`;
  if (t === "boolean" || v === null) return String(v);
  throw Error(`unsupported value type: ${t}`);
}
