const REGEX_PATTERNS = [
  /\s+/y,               // 0: WS (skipped)
  /-?\d*\.?\d+/y,       // 1: NUM
// single chars here
  /'[^']*'/y,           // 2: ID"
  /true\b/y,            // 3: T
  /false\b/y,           // 4: F
  /null\b/y,            // 5: Null
  /"[^"]*"/y,           // 6: STR
  /[a-zA-Z_][^=\s]*/y   // 7: ID
];

const TOKEN_TYPES = ['', 'NUM', 'ID"', 'T', 'F', 'Null', 'STR', 'ID'];

function tokenize(input) {
  const tokens = [];
  let _pos = 0;

  while (_pos < input.length) {
    bb: {
      let i = 0; let ending = 2;
      while(true) {
        while(i < ending) {
          const pattern = REGEX_PATTERNS[i];
          pattern.lastIndex = _pos;
          const match = pattern.exec(input);
          if (match) {
            if (i !== 0) { // Skip WS
              tokens.push({ t: TOKEN_TYPES[i], _value: match[0], _pos });
            }
            _pos += match[0].length;
            if (i !== 0 || _pos >= input.length) { break bb; }
          }
          i++;
        }
        ending = 8;  // REGEX_PATTERNS.length
        if (i >= ending) {
          throw Error(`\tBad character at ${_pos}: ${input[_pos]}`);
        }
        const t = input[_pos];
        switch(t) {
        case '-': 
        case ',': 
        case '[': 
        case ']': 
        case '=': 
          tokens.push({ t, _pos });
          _pos++;
          break bb;
        case '"':
          i = 6;
        };
      }
    }
  }

  return tokens;
}

let END = { t: 'END' };

class MonParser {
  constructor() {
    this._tokens = [];
    this._pos = 0;
  }

  _peek() {
    return this._tokens[this._pos]?.t || 'END';
  }
  
  _eat(type) {
    const token = this._tokens[this._pos++] || END;
    if (token.t === type) {
      return token;
    }
    throw Error(`\tExpected ${type}, got ${token.t} at ${token._pos}`);
  }

  _section() {
    let result = null;
    let items = null;
    let currentSubArray = null;

    while (true) {
      let next = this._peek()[0];
      switch (next) {
      case '-':
      case ',':
        this._pos++;
        items ??= [];
        let value;
        
        if (this._peek()[0] === 'I') { // ID or ID"
          value = {};
          this._keyValue(value);
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
        break;
      
      case 'I':   // ID or ID"
        result = result ? { _: result } : {};
        this._keyValue(result);
        break;
      
      case 'E':   // END
        if (currentSubArray) {
          items.push(currentSubArray.length === 1 ? currentSubArray[0] : currentSubArray);
        }
        if (result) {
          if (items) result._ = items;
          return result;
        }
        return items ? items : {};
      
      default: 
        if (result) this._eat('END');
        result = this._value();
      }
    }

}

  _keyValue(output) {
    let next = this._peek();
    do {
      let noQuote = next === 'ID';
      let key = this._eat(next)._value;
      key = noQuote ? key : key.slice(1, -1);
      this._eat('=');
      output[key] = this._value();
      next = this._peek();
    } while (next[0] === 'I')
  }

  _bracket() {
    const items = [];
    while (this._peek() !== ']') {
      items.push(this._value());
      if (this._peek() === ',') {
        this._pos++;
      }
    }
    this._pos++;
    return items;
  }

  _value() {
    const token = this._tokens[this._pos++] || END;
    switch (token.t) {
      case 'STR': return token._value.slice(1, -1);
      case 'NUM': return parseFloat(token._value);
      case 'T': return true;
      case 'F': return false;
      case 'Null': return null;
      case '[': return this._bracket();
      default:
        throw Error(`\tBad token: ${token.t} at ${token._pos}`);
    }
  }
}

const parser = new MonParser();

let digits = /^\d+$|^\[\]$/;

function parseSection(node, trust, root = null, groot = null,
    tags = [], tagCode = {}, subTags = {}, inTag = false) {
  let obj = {};
  
try {
  
  if (!inTag) try {
    if (node._lines.length) { // parse item
      parser._tokens = tokenize(node._lines.join('\n'));
      parser._pos = 0; 
      obj = parser._section();
    }
  } catch (err) {
    throw Error(`\n\tParser error:\n${err.message}`)
  }
  
  let childData = undefined;
  let space = /\s+/;
  for (const child of node._kids) {
    let [cname, ctags] = child._name.split(' : ');
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
      const code = child._lines.join('\n');
      try {
        let fn = new Function('root', code);
        if (fn) { tagCode[cname] = fn; }
      } catch (error) {
        throw Error(`${cname}\n\tError parsing code: ${error}`);
      }
      
      parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, true);
      continue;
    }
    
//    case '#':
//    case '>':
    default:
      if (inTag) {
        let [pname, ptags] = node._name.split(' : ');
        let pLabel = (node._nodeType === ':') ? pname : ptags;
        let parent = subTags[pLabel] ??= [];
        let cLabel = cname === '*' ? ' ' : cname;
        (parent[cLabel] ??= []).push(...ctags);
        if (cLabel.endsWith(".[]")) {
          const arrayTags = ctags.map(tag => " " + tag);
          let sliced = cLabel.slice(0,-3);
          if (sliced === '*') { sliced = ' '; }
          (parent[sliced] ??= []).push(...arrayTags);
        }
      }
      childData = parseSection(child, trust, root || obj, groot, ctags, tagCode, subTags, inTag);
      break;
    }

    if (childData === undefined || inTag) { continue; }
    let prefixes =
      cname[cname.length - 1] === '.' ? [cname.slice(0, -1)] :
      trust < 0 ? [cname] : 
      cname.split('.');
    
    if (!prefixes.length) {
      obj = childData;
      continue;
    }
    
    if (typeof obj !== "object") obj = { _: obj };
    
    const handlePrefix = (prefix, dest) => {
      if (prefix === '[]') return dest.length;
      if (prefix[0] === '[' && prefix.at(-1) === ']') {
        if (!Array.isArray(dest)) throw Error(`${cname}\n\tCan't insert in non-array`);
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
    let arrayTag = tag[0] === ' ';
    if (arrayTag) {
      tag = tag.slice(1);
    }
    let fn = tagCode[tag];
    if (!fn) { continue; }
    if (arrayTag && !node._name.endsWith(".[]")) {
      if (Array.isArray(obj)) {
        for (let o of obj) {
          fn.call(o, root, groot);
        }
      }
    }
    else { fn.call(obj, root, groot); }
  }

} catch (err) {
  throw Error(`${node._name} -> ${err.message}`)
}

  if (node._bag) {
    Object.assign(node._bag, obj);
    return;
  }
  return obj;
}

export function parseMon(text, trust = 1, bags = null, groot = null, tags = [], tagCode = {}, subTags = {}) {
  const lines = text.split('\n');
  let stack = [{ level: 0, _name: '', _lines: [], _kids: [] }];
  let current = stack[0];
  let lastValidNodes = [];

  let commentLevel = 0;
  let textLevel = 0;

  // build hierarchy
  for (let line of lines) {
    if (!textLevel) { line = line.trimStart(); }
    
    let level = 0;
    while (line[level] === '#') level++;

    if (commentLevel) {
      if (level && level <= commentLevel) {
        commentLevel = 0;
      } else continue;
    }

    if (level) {
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

      let headerLength = (_nodeType != '#') ? level + 1 : level;

      let isDitto = _nodeType === '=' && current._kids.length !== 0;
      if (isDitto) { _nodeType = '#'; }

      let _name = line.slice(headerLength).trim();
      const node = { level, _name, _lines: [], _kids: [], _nodeType };
      if (isDitto && trust > 0 && lastValidNodes[level]) {
        node._lines = [...lastValidNodes[level]._lines];
        node._kids = [...lastValidNodes[level]._kids];
      }
      
      if (bags && _nodeType === '>') {
        let path = stack.map((node) => { return node._name.split(' : ')[0] });
        let item = [path.slice(1), {}];
        (bags[_name] ??= []).push(item);
        node._bag = item[1];
      }

      stack.push(node);
      current._kids.push(node);
      current = node;

      if (!isDitto
          && (_nodeType === '#' || _nodeType === '=')) {
        lastValidNodes[level] = node;
      }
    
    } else if (!line.startsWith('//'))
      current._lines.push(line);
  }

  return parseSection(stack[0], trust, null, groot, tags, tagCode, subTags);
}

