const PATTERNS = [
  { type: 'WS', pat: /\s+/y, skip: true },
  { type: 'NumLit', pat: /-?(\d*\.\d+|\d+\.?\d*)/y },
  { type: '-', pat: /-/y },
  { type: ',', pat: /,/y },
  { type: '[', pat: /\[/y },
  { type: ']', pat: /]/y },
  { type: '=', pat: /=/y },
  { type: 'QuoteID', pat: /'[^']*'/y },
  { type: 'T', pat: /\btrue\b/y },
  { type: 'F', pat: /\bfalse\b/y },
  { type: 'Null', pat: /\bnull\b/y },
  { type: 'StringLit', pat: /"[^"]*"/y },
  { type: 'ID', pat: /[a-zA-Z_]\w*/y },
];

function tokenize(input) {
  const tokens = [];
  let pos = 0;

  while (pos < input.length) {
    let matched = false;
    for (const { type, pat, skip } of PATTERNS) {
      pat.lastIndex = pos;
      const match = pat.exec(input);

      if (match) {
        if (!skip) {
          tokens.push({ type, value: match[0], pos });
        }
        pos += match[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`Unexpected character at position ${pos}: ${input[pos]}`);
    }
  }
  return tokens;
}

let EOF = { type: 'EOF' };

class MONParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos]?.type || 'EOF';
  }

  eat(type) {
    const token = this.tokens[this.pos] || EOF;
    if (token.type === type) {
      this.pos++;
      return token;
    }
    throw new Error(`Expected ${type}, got ${token.type} at position ${token.pos}`);
  }

  option(type) {
    if (this.peek() === type) {
      this.pos++;
      return true;
    }
    return false;
  }

  section() {
    const result = {};
    const items = [];
    let currentSubArray = null;

    while (this.peek() !== 'EOF') {
      const next = this.peek();
      if (next === 'QuoteID' || next === 'ID') {
        const kv = this.keyValue();
        Object.assign(result, kv);
      } else if (next === '-' || next === ',') {
        const isDash = next === '-';
        this.eat(isDash ? '-' : ',');
        
        const nextType = this.peek();
        let value = nextType === 'QuoteID' || nextType === 'ID' ? this.KVSet() : this.value();

        if (isDash) {
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
        return value;
      }
    }

    if (currentSubArray) {
      items.push(currentSubArray.length === 1 ? currentSubArray[0] : currentSubArray);
    }

    return items.length > 0 ? items : result;
}

  keyValue() {
    const keyToken = this.peek() === 'QuoteID'
      ? this.eat('QuoteID')
      : this.eat('ID');
    const key = keyToken.type === 'QuoteID'
      ? keyToken.value.slice(1, -1)
      : keyToken.value;
    this.eat('=');
    const value = this.value();
    return { [key]: value };
  }

  bracketArray() {
    const items = [];
    if (this.peek() !== ']') {
      items.push(this.value());
      while (this.option(',')) {
        items.push(this.value());
      }
    }
    this.eat(']');
    return items;
  }

  value() {
    const token = this.tokens[this.pos] || EOF;
    this.pos++;
    switch (token.type) {
      case 'StringLit': return token.value.slice(1, -1);
      case 'NumLit': return parseFloat(token.value);
      case 'T': return true;
      case 'F': return false;
      case 'Null': return null;
      case '[': return this.bracketArray();
      default:
        throw new Error(`Unexpected token: ${token.type} at position ${token.pos}`);
    }
  }

  KVSet() {
    const result = {};
    do {
      Object.assign(result, this.keyValue());
    } while (this.peek() === 'QuoteID' || this.peek() === 'ID');
    return result;
  }
}

const parser = new MONParser([]);

function parseItem(sectionText) {
  parser.tokens = tokenize(sectionText);
  parser.pos = 0; // Reset position
  return parser.section();
}


function parseSection(node, trust, root = null, groot = null,
    tags = [], tagCode = {}, subTags = {}, inTag = false) {
  let obj = {};
  
  if (!inTag) try {
    if (node.content.length) {
      obj = parseItem(node.content.join('\n'));
    }
  } catch (err) {
    throw new Error(`\nParser error in section "${node.name}":\n${err.message}`)
  }
  
  let childData = null;
  for (const child of node.kids) {
    let [cname, ctags] = child.name.split(' : ');
    ctags = ctags ? ctags.trim().split(/\s+/) : [];
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

    case 'TEXT':
      childData = child.content.join('\n');
      break;

    case ';': {
      if (trust < 2) {
        console.log(`Code section "${cname}" skipped due to trust level.`);
        continue;
      }

      const code = child.content.join('\n');
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
      const code = child.content.join('\n');
      try {
        fn = new Function('root', code);
      } catch (error) {
        console.error(`Error parsing code in section "${cname}":`, error);
      }
      if (fn) { tagCode[cname] = fn; }
      parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, true);
      continue;
    }
    
    case '#':
    default:
      if (inTag) {
        let [pname, ptags] = node.name.split(' : ');
        let pLabel = (node.nodeType === ':') ? pname : ptags;
        if (!subTags[pLabel]) { subTags[pLabel] = []; };
        let parent = subTags[pLabel];
        let cLabel = cname;
        if (cLabel === '*') { cLabel = ' '; }
        if (!parent[cLabel]) { parent[cLabel] = []; }
        parent[cLabel] = parent[cLabel].concat(ctags);
        if (cLabel.endsWith(".[]")) {
          const arrayTags = ctags.map(tag => " " + tag);
          let sliced = cLabel.slice(0,-3);
          if (sliced === '*') { sliced = ' '; }
          if (!parent[sliced]) { parent[sliced] = []; }
          parent[sliced] = parent[sliced].concat(arrayTags);
        }
      }
      childData = parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, inTag);
      break;
    }

    if (!childData || inTag) { continue; }
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

    let destination = obj;

    for (let i = 0; i < prefixes.length - 1; i++) {
      let prefix = handlePrefix(prefixes[i], destination);
      if (!destination[prefix]) { destination[prefix] = {}; }
      let next = prefixes[i + 1];
      if ((next === '0' || next === "[]") && !Array.isArray(destination[prefix])) {
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
  let stack = [{ level: 0, name: '', content: [], kids: [] }];
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
        current.content.push(line.slice(textLevel).trim());
        continue;
      }
      
      let nodeType = line[level];
      textLevel = 0;
      
      switch (nodeType) {
      case '/': commentLevel = level; continue;
      case '"': textLevel = level; nodeType = 'TEXT'; break;
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
      const node = { level, name, content: [], kids: [], nodeType };
      if (isDitto && trust > 0 && lastValidNodes[level]) {
        node.content = [...lastValidNodes[level].content];
        node.kids = [...lastValidNodes[level].kids];
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
      current.content.push(line);
      break;

    default:
      current.content.push(line);
      break;
    }
  }

  return parseSection(stack[0], trust, null, groot, tags, tagCode, subTags);
}

