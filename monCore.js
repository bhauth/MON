const PATTERNS = [
  { t: 'WS', pat: /\s+/y, skip: true },
  { t: 'NUM', pat: /-?(\d*\.\d+|\d+\.?\d*)/y },
  { t: '-', pat: /-/y },
  { t: ',', pat: /,/y },
  { t: '[', pat: /\[/y },
  { t: ']', pat: /]/y },
  { t: '=', pat: /=/y },
  { t: 'ID"', pat: /'[^']*'/y },
  { t: 'T', pat: /\btrue\b/y },
  { t: 'F', pat: /\bfalse\b/y },
  { t: 'Null', pat: /\bnull\b/y },
  { t: 'STR', pat: /"[^"]*"/y },
  { t: 'ID', pat: /[a-zA-Z_][^=\s]*/y },
];

function tokenize(input) {
  const tokens = [];
  let pos = 0;

  while (pos < input.length) {
    let matched = false;
    for (const { t, pat, skip } of PATTERNS) {
      pat.lastIndex = pos;
      const match = pat.exec(input);

      if (match) {
        if (!skip) {
          tokens.push({ t, value: match[0], pos });
        }
        pos += match[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`Bad character at ${pos}: ${input[pos]}`);
    }
  }
  return tokens;
}

let END = { t: 'END' };

class MONParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos]?.t || 'END';
  }
  
  eat(type) {
    const token = this.tokens[this.pos] || END;
    if (token.t === type) {
      this.pos++;
      return token;
    }
    throw new Error(`Expected ${type}, got ${token.t} at ${token.pos}`);
  }

  section() {
    const result = {};
    const items = [];
    let currentSubArray = null;

    while (true) {
      const next = this.peek();
      if (next === 'END') break;
      if (next[0] === 'I') { // ID or ID"
        this.keyValue(result);
      } else if (next === '-' || next === ',') {
        this.pos++;
        
        let value;
        if (this.peek()[0] === 'I') { // ID or ID"
          value = {};
          do {
            this.keyValue(value);
          } while (this.peek()[0] === 'I'); 
        } else {
          value = this.value();
        }

        if (next === '-') {
          if (currentSubArray) {
            items.push(currentSubArray.length === 1 ? currentSubArray[0] : currentSubArray);
          }
          currentSubArray = [value];
        } else {
          if (currentSubArray) {
            currentSubArray.push(value);
          } else {
            items.push(value);
          }
        }
      } else {
        const value = this.value();
        this.eat('END');
        return value;
      }
    }

    if (currentSubArray) {
      items.push(currentSubArray.length === 1 ? currentSubArray[0] : currentSubArray);
    }

    return items.length ? items : result;
}

  keyValue(result) {
    let noQuote = this.peek() === 'ID';
    let key = noQuote ?
      this.eat('ID').value :
      this.eat('ID"').value.slice(1, -1);
    this.eat('=');
    result[key] = this.value();
  }

  bracket() {
    const items = [];
    if (this.peek() !== ']') {
      items.push(this.value());
      while (this.peek() === ',') {
        this.pos++;
        items.push(this.value());
      }
    }
    this.eat(']');
    return items;
  }

  value() {
    const token = this.tokens[this.pos] || END;
    this.pos++;
    switch (token.t) {
      case 'STR': return token.value.slice(1, -1);
      case 'NUM': return parseFloat(token.value);
      case 'T': return true;
      case 'F': return false;
      case 'Null': return null;
      case '[': return this.bracket();
      default:
        throw new Error(`Bad token: ${token.t} at ${token.pos}`);
    }
  }
}

const parser = new MONParser([]);

let digits = /^\d+$|^\[\]$/;

function parseSection(node, trust, root = null, groot = null,
    tags = [], tagCode = {}, subTags = {}, inTag = false) {
  let obj = {};
  
  if (!inTag) try {
    if (node.lines.length) { // parse item
      parser.tokens = tokenize(node.lines.join('\n'));
      parser.pos = 0; 
      obj = parser.section();
    }
  } catch (err) {
    throw new Error(`\nParser error in section "${node.name}":\n${err.message}`)
  }
  
  let childData = undefined;
  let space = /\s+/;
  for (const child of node.kids) {
    let [cname, ctags] = child.name.split(' : ');
    ctags = ctags ? ctags.trim().split(space) : [];
    cname = cname.trim();
    
    if (!inTag) {
      for (let tag of tags) {
        let sts = subTags[tag];
        if (sts && sts[cname]) { ctags = ctags.concat(sts[cname]); }
        if (sts && sts[' ']) { ctags = ctags.concat(sts[' ']); }
      }
    }
    
    switch (child.nodeType) {
    case '/':
    case '=':
      continue;

    case '"':
      childData = child.lines.join('\n');
      break;

    case ';': {
      if (trust < 2) {
        console.log(`Code section "${cname}" skipped due to trust level.`);
        continue;
      }

      const code = child.lines.join('\n');
      try {
        const fn = new Function('root', trust >= 3 ? 'groot' : '', code);
        const result = fn.call(obj, root, trust >= 3 ? groot : undefined);
        childData = result;
      } catch (error) {
        console.error(`Error executing code in section "${cname}":`, error);
      }
      break;
    }
    
    case ':': {
      if (trust < 3) {
        console.log(`Tag section "${cname}" skipped due to trust level.`);
        continue;
      }
      let fn = null;
      const code = child.lines.join('\n');
      try {
        fn = new Function('root', code);
      } catch (error) {
        console.error(`Error parsing code in section "${cname}":`, error);
      }
      if (fn) { tagCode[cname] = fn; }
      parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, true);
      continue;
    }
    
//    case '#':
    default:
      if (inTag) {
        let [pname, ptags] = node.name.split(' : ');
        let pLabel = (node.nodeType === ':') ? pname : ptags;
        subTags[pLabel] ??= [];
        let parent = subTags[pLabel];
        let cLabel = cname === '*' ? ' ' : cname;
        parent[cLabel] ??= [];
        parent[cLabel] = parent[cLabel].concat(ctags);
        if (cLabel.endsWith(".[]")) {
          const arrayTags = ctags.map(tag => " " + tag);
          let sliced = cLabel.slice(0,-3);
          if (sliced === '*') { sliced = ' '; }
          parent[sliced] ??= [];
          parent[sliced] = parent[sliced].concat(arrayTags);
        }
      }
      childData = parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, inTag);
      break;
    }

    if (childData === undefined || inTag) { continue; }
    let prefixes = cname.split('.');

    if (trust < 0) {
      if (prefixes.length === 2 && prefixes[1] === '[]') {}
      else { prefixes = cname ? [cname] : []; }
    }
    
    if (!prefixes.length) {
      obj = childData;
      continue;
    }
    
    const handlePrefix = (prefix, dest) => {
      if (prefix === '[]') return dest.length;
      if (prefix[0] === '[' && prefix.at(-1) === ']') {
        if (!Array.isArray(dest)) throw new Error(`Non-array at "${cname}"`);
        let key = prefix.slice(1, -1);
        let i = dest.findIndex(item => item === key);
        return i >= 0 ? i : dest.length;
      }
      return prefix;
    };

    if (digits.test(prefixes[0]) && !Array.isArray(obj)) { obj = []; }
    let destination = obj;

    for (let i = 0; i < prefixes.length - 1; i++) {
      let prefix = handlePrefix(prefixes[i], destination);
      destination[prefix] ??= {};
      let next = prefixes[i + 1];
      if (digits.test(next) && !Array.isArray(destination[prefix])) {
        destination[prefix] = [];
      }
      destination = destination[prefix];
    }
    
    let last = prefixes[prefixes.length - 1];
    destination[handlePrefix(last, destination)] = childData;
  }
  
  if (inTag) { return obj; }
  
  for (let tag of tags) {
    let arrayTag = false;
    if (tag[0] === ' ') {
      tag = tag.slice(1);
      arrayTag = true;
    }
    let fn = tagCode[tag];
    if (!fn) { continue; }
    if (arrayTag && !node.name.endsWith(".[]")) {
      if (Array.isArray(obj)) {
        for (let o of obj) {
          fn.call(o, root, groot);
        }
      }
    }
    else { fn.call(obj, root, groot); }
  }

  return obj;
}

function countLeadingHashes(line) {
  let count = 0;
  while (line[count] === '#') count++;
  return count;
}

export function parseMON(text, trust = 1, groot = null, tags = [], tagCode = {}, subTags = {}) {
  const lines = text.split('\n');
  let stack = [{ level: 0, name: '', lines: [], kids: [] }];
  let current = stack[0];
  let lastValidNodes = [];

  let commentLevel = 0;
  let textLevel = 0;

  // build hierarchy
  for (let line of lines) {
    if (!textLevel) { line = line.trimStart(); }

    if (commentLevel) {
      if (line[0] === '#' && (countLeadingHashes(line) <= commentLevel)) {
        commentLevel = 0;
      } else continue;
    }

    switch (line[0]) {
    case '#':
      const level = countLeadingHashes(line);
      
      if (textLevel && level > textLevel) {
        current.lines.push(line.slice(textLevel).trim());
        continue;
      }
      
      let nodeType = line[level];
      textLevel = 0;
      
      switch (nodeType) {
      case '/': commentLevel = level; continue;
      case '"': textLevel = level; break;
      case '=': 
      case ';': 
      case ':': break;
      default: nodeType = '#'; break;
      }

      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      current = stack[stack.length - 1];

      let isDitto = false;
      if (nodeType === '=' && current.kids.length !== 0) {
        nodeType = '#';
        isDitto = true;
      }

      let headerLength = isDitto || (nodeType != '#') ? level + 1 : level;
      let name = line.slice(headerLength).trim();
      const node = { level, name, lines: [], kids: [], nodeType };
      if (isDitto && trust > 0 && lastValidNodes[level]) {
        node.lines = lastValidNodes[level].lines;
        node.kids = lastValidNodes[level].kids;
      }

      stack.push(node);
      current.kids.push(node);
      current = node;

      if (!isDitto
          && (nodeType === '#' || nodeType === '=')) {
        lastValidNodes[level] = node;
      }
      break;

    case '/':
      if (line.startsWith('//')) continue;
      // fallthru
    default:
      current.lines.push(line);
      break;
    }
  }

  return parseSection(stack[0], trust, null, groot, tags, tagCode, subTags);
}

