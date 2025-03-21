const SINGLE_CHARS = {
  '-': true,
  ',': true,
  '[': true,
  ']': true,
  '=': true,
};

const REGEX_PATTERNS = [
  /\s+/y,               // 0: WS (skipped)
  /-?\d*\.?\d+/y,       // 1: NUM
// single chars here
  /'[^']*'/y,           // 2: ID"
  /\btrue\b/y,          // 3: T
  /\bfalse\b/y,         // 4: F
  /\bnull\b/y,          // 5: Null
  /"[^"]*"/y,           // 6: STR
  /[a-zA-Z_][^=\s]*/y   // 7: ID
];

const TOKEN_TYPES = ['WS', 'NUM', 'ID"', 'T', 'F', 'Null', 'STR', 'ID'];

function tokenize(input) {
  const tokens = [];
  let pos = 0;

  while (pos < input.length) {
    bb: {
      let i = 0; let ending = 2;
      while(true) {
        while(i < ending) {
          const pattern = REGEX_PATTERNS[i];
          pattern.lastIndex = pos;
          const match = pattern.exec(input);
          if (match) {
            if (i !== 0) { // Skip WS
              tokens.push({ t: TOKEN_TYPES[i], _value: match[0], pos });
            }
            pos += match[0].length;
            break bb;
          }
          i++;
        }
        ending = REGEX_PATTERNS.length;
        if (i >= ending) {
          throw Error(`\tBad character at ${pos}: ${input[pos]}`);
        }
        const c = input[pos];
        const singleCharMatch = SINGLE_CHARS[c];
        if (singleCharMatch) {
          tokens.push({ t: c, _value: c, pos });
          pos++;
          break bb;
        }
      }
    }
  }

  return tokens;
}

let END = { t: 'END' };

class MONParser {
  constructor(tokens) {
    this._tokens = tokens;
    this.pos = 0;
  }

  _peek() {
    return this._tokens[this.pos]?.t || 'END';
  }
  
  _eat(type) {
    const token = this._tokens[this.pos] || END;
    if (token.t === type) {
      this.pos++;
      return token;
    }
    throw Error(`\tExpected ${type}, got ${token.t} at ${token.pos}`);
  }

  section() {
    const result = {};
    const items = [];
    let currentSubArray = null;

    while (true) {
      const next = this._peek();
      if (next === 'END') break;
      if (next[0] === 'I') { // ID or ID"
        this._keyValue(result);
      } else if (next === '-' || next === ',') {
        this.pos++;
        
        let value;
        if (this._peek()[0] === 'I') { // ID or ID"
          value = {};
          do {
            this._keyValue(value);
          } while (this._peek()[0] === 'I'); 
        } else {
          value = this._value();
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
        const value = this._value();
        this._eat('END');
        return value;
      }
    }

    if (currentSubArray) {
      items.push(currentSubArray.length === 1 ? currentSubArray[0] : currentSubArray);
    }

    return items.length ? items : result;
}

  _keyValue(result) {
    let noQuote = this._peek() === 'ID';
    let key = noQuote ?
      this._eat('ID')._value :
      this._eat('ID"')._value.slice(1, -1);
    this._eat('=');
    result[key] = this._value();
  }

  _bracket() {
    const items = [];
    if (this._peek() !== ']') {
      items.push(this._value());
      while (this._peek() === ',') {
        this.pos++;
        items.push(this._value());
      }
    }
    this._eat(']');
    return items;
  }

  _value() {
    const token = this._tokens[this.pos] || END;
    this.pos++;
    switch (token.t) {
      case 'STR': return token._value.slice(1, -1);
      case 'NUM': return parseFloat(token._value);
      case 'T': return true;
      case 'F': return false;
      case 'Null': return null;
      case '[': return this._bracket();
      default:
        throw Error(`\tBad token: ${token.t} at ${token.pos}`);
    }
  }
}

const parser = new MONParser([]);

let digits = /^\d+$|^\[\]$/;

function parseSection(node, trust, root = null, groot = null,
    tags = [], tagCode = {}, subTags = {}, inTag = false) {
  let obj = {};
  
try {
  
  if (!inTag) try {
    if (node._lines.length) { // parse item
      parser._tokens = tokenize(node._lines.join('\n'));
      parser.pos = 0; 
      obj = parser.section();
    }
  } catch (err) {
    throw Error(`\n\tParser error:\n${err.message}`)
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
        if (sts?.[cname]) { ctags.push(...sts[cname]); }
        if (sts?.[' ']) { ctags.push(...sts[' ']); }
      }
    }
    
    switch (child._nodeType) {
    case '/':
    case '=':
      continue;

    case '"':
      childData = child._lines.join('\n');
      break;

    case ';': {
      if (trust < 2) {
        console.log(`Code section "${cname}" skipped due to trust level.`);
        continue;
      }

      const code = child._lines.join('\n');
      try {
        const fn = new Function('root', trust >= 3 ? 'groot' : '', code);
        const result = fn.call(obj, root, trust >= 3 ? groot : undefined);
        childData = result;
      } catch (error) {
        throw Error(`${cname}\n\tError running code:\n\t${error}`);
      }
      break;
    }
    
    case ':': {
      if (trust < 3) {
        console.log(`Tag section "${cname}" skipped due to trust level.`);
        continue;
      }
      let fn = null;
      const code = child._lines.join('\n');
      try {
        fn = new Function('root', code);
      } catch (error) {
        throw Error(`${cname}\n\tError parsing code: ${error}`);
      }
      if (fn) { tagCode[cname] = fn; }
      parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, true);
      continue;
    }
    
//    case '#':
//    case '>':
    default:
      if (inTag) {
        let [pname, ptags] = node.name.split(' : ');
        let pLabel = (node._nodeType === ':') ? pname : ptags;
        subTags[pLabel] ??= [];
        let parent = subTags[pLabel];
        let cLabel = cname === '*' ? ' ' : cname;
        parent[cLabel] ??= [];
        parent[cLabel].push(...ctags);
        if (cLabel.endsWith(".[]")) {
          const arrayTags = ctags.map(tag => " " + tag);
          let sliced = cLabel.slice(0,-3);
          if (sliced === '*') { sliced = ' '; }
          parent[sliced] ??= [];
          parent[sliced].push(...arrayTags);
        }
      }
      childData = parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, inTag);
      break;
    }

    if (childData === undefined || inTag) { continue; }
    let prefixes =
      trust < 0 ? [cname] : 
      cname[cname.length - 1] === '.' ? [cname.slice(0, -1)] :
      cname.split('.');
    
    if (!prefixes.length) {
      obj = childData;
      continue;
    }
    
    const handlePrefix = (prefix, dest) => {
      if (prefix === '[]') return dest.length;
      if (prefix[0] === '[' && prefix.at(-1) === ']') {
        if (!Array.isArray(dest)) throw Error(`${cname}\n\tAttempted insertion in non-array`);
        let key = prefix.slice(1, -1);
        let i = dest.indexOf(key);
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
  
  if (inTag) { return; }
  
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

} catch (err) {
  throw Error(`${node.name} -> ${err.message}`)
}

  if (node._collection) {
    Object.assign(node._collection, obj);
    return;
  }
  return obj;
}

function countLeadingHashes(line) {
  let count = 0;
  while (line[count] === '#') count++;
  return count;
}

export function parseMON(text, trust = 1, collections = null, groot = null, tags = [], tagCode = {}, subTags = {}) {
  const lines = text.split('\n');
  let stack = [{ level: 0, name: '', _lines: [], kids: [] }];
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
        current._lines.push(line.slice(textLevel).trim());
        continue;
      }
      
      let _nodeType = line[level];
      textLevel = 0;
      
      switch (_nodeType) {
      case '/': commentLevel = level; continue;
      case '"': textLevel = level; break;
      case '=': 
      case ';': 
      case ':': 
      case '>': break;
      default: _nodeType = '#'; break;
      }

      while (stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      current = stack[stack.length - 1];

      let isDitto = false;
      if (_nodeType === '=' && current.kids.length !== 0) {
        _nodeType = '#';
        isDitto = true;
      }

      let headerLength = isDitto || (_nodeType != '#') ? level + 1 : level;
      let name = line.slice(headerLength).trim();
      const node = { level, name, _lines: [], kids: [], _nodeType };
      if (isDitto && trust > 0 && lastValidNodes[level]) {
        node._lines = lastValidNodes[level]._lines;
        node.kids = lastValidNodes[level].kids;
      }
      
      if (collections && _nodeType === '>') {
        collections[name] ??= [];
        let path = stack.map((node) => { return node.name.split(' : ')[0] });
        let item = [path.slice(1), {}];
        collections[name].push(item);
        node._collection = item[1];
      }

      stack.push(node);
      current.kids.push(node);
      current = node;

      if (!isDitto
          && (_nodeType === '#' || _nodeType === '=')) {
        lastValidNodes[level] = node;
      }
      break;

    case '/':
      if (line[1] === '/') continue;
      // fallthru
    default:
      current._lines.push(line);
      break;
    }
  }

  return parseSection(stack[0], trust, null, groot, tags, tagCode, subTags);
}

