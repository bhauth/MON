const NUM_PATTERN = /-?\d*\.?\d+(?:[eE][+-]?\d+)?/y;
const ID_QUOTE_PATTERN = /'[^']*'/y;
const STR_PATTERN = /"[^"]*"/y;
const WS_PATTERN = /\s+/y;
const ID_PATTERN = /[a-zA-Z_][^=\s]*/y;
const T_PATTERN = /true\b/y;
const F_PATTERN = /false\b/y;
const NULL_PATTERN = /null\b/y;

// Push a token of `type` if `pattern` matches at _pos; return the match
// length, or 0 when it does not match.
function at(tokens, input, _pos, pattern, type) {
  pattern.lastIndex = _pos;
  const m = pattern.exec(input);
  if (!m) { return 0; }
  tokens.push({ t: type, _value: m[0], _pos });
  return m[0].length;
}

function tokenize(input) {
  const tokens = [];
  let _pos = 0;

  while (_pos < input.length) {
    const c = input[_pos];
    let n;

    switch (c) {
    case ' ':
    case '\n':
      _pos++;
      continue;

    case ',':
    case '[':
    case ']':
    case '=':
      tokens.push({ t: c, _pos });
      _pos++;
      continue;

    // '-' is punctuation unless a number follows it
    case '-':
      n = at(tokens, input, _pos, NUM_PATTERN, 'NUM');
      if (!n) {
        tokens.push({ t: c, _pos });
        n = 1;
      }
      break;

    case '"':
      n = at(tokens, input, _pos, STR_PATTERN, 'STR');
      break;

    case "'":
      n = at(tokens, input, _pos, ID_QUOTE_PATTERN, 'ID"');
      break;

    case 't':
      n = at(tokens, input, _pos, T_PATTERN, 'T') || at(tokens, input, _pos, ID_PATTERN, 'ID');
      break;

    case 'f':
      n = at(tokens, input, _pos, F_PATTERN, 'F') || at(tokens, input, _pos, ID_PATTERN, 'ID');
      break;

    case 'n':
      n = at(tokens, input, _pos, NULL_PATTERN, 'Null') || at(tokens, input, _pos, ID_PATTERN, 'ID');
      break;

    default:
      WS_PATTERN.lastIndex = _pos;
      if (WS_PATTERN.test(input)) {
        _pos = WS_PATTERN.lastIndex;
        continue;
      }
      n = at(tokens, input, _pos, NUM_PATTERN, 'NUM') || at(tokens, input, _pos, ID_PATTERN, 'ID');
    }

    if (!n) { throw Error(`\tBad character at ${_pos}: ${c}`); }
    _pos += n;
  }

  return tokens;
}

let END = { t: 'END' };

let _tokens = [];
let _pos = 0;

function _peek() {
  return _tokens[_pos].t;
}

function _eat(type) {
  const token = _tokens[_pos++];
  if (token.t === type) {
    return token;
  }
  throw Error(`\tExpected ${type}, got ${token.t} at ${token._pos}`);
}

function _section() {
  let result = null;
  let items = null;
  let currentSubArray = null;

  while (true) {
    let next = _peek()[0];
    switch (next) {
    case '-':
    case ',':
      _pos++;
      items ??= [];
      let value;
      
      if (_peek()[0] === 'I') { // ID or ID"
        value = {};
        _keyValue(value);
      } else {
        value = _value();
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
      _keyValue(result);
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
      if (result) _eat('END');
      result = _value();
    }
  }
}

function _keyValue(output) {
  let next = _peek();
  do {
    let noQuote = next === 'ID';
    let key = _eat(next)._value;
    key = noQuote ? key : key.slice(1, -1);
    _eat('=');
    output[key] = _value();
    next = _peek();
  } while (next[0] === 'I')
}

function _bracket() {
  const items = [];
  while (_peek() !== ']') {
    items.push(_value());
    if (_peek() === ',') {
      _pos++;
    }
  }
  _pos++;
  return items;
}

function _value() {
  const token = _tokens[_pos++];
  switch (token.t) {
    case 'STR': return token._value.slice(1, -1);
    case 'NUM': return parseFloat(token._value);
    case 'T': return true;
    case 'F': return false;
    case 'Null': return null;
    case '[': return _bracket();
    default:
      throw Error(`\tBad token: ${token.t} at ${token._pos}`);
  }
}

let digits = /^\d+$|^\[\]$/;

function parseSection(node, trust, root = null, groot = null,
    tags = [], tagCode = {}, subTags = {}, inTag = false) {
  let obj = {};
  
try {
  
  if (!inTag) try {
    const lines = node._lines;
    if (lines.length) { // parse item
      _tokens = tokenize(lines.length === 1 ? lines[0] : lines.join('\n'));
      _tokens.push(END);
      _pos = 0; 
      obj = _section();
    }
  } catch (err) {
    throw Error(`\n\tParser error:\n${err.message}`)
  }
  
  let childData = undefined;
  for (const child of node._kids) {
    let cname = child._name, ctags = child._tags;
    
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
        let pname = node._name, ptags = node._tags;
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
        current._lines.push(line.slice(textLevel));
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

      const [_name, _tags] = line.slice(headerLength).trim().split(' : ');
      const node = { level, _name: _name.trim(), _tags: _tags?.trim().split(WS_PATTERN) ?? [],
        _lines: [], _kids: [], _nodeType };
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
    
    } else if (textLevel || !line.startsWith('//'))
      current._lines.push(line);
  }

  return parseSection(stack[0], trust, null, groot, tags, tagCode, subTags);
}

