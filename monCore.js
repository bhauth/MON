import { createToken, Lexer, CstParser } from 'chevrotain';

const Hash = createToken({ name: 'Hash', pattern: /#+/ });
const Slash = createToken({ name: 'Slash', pattern: /\// });
const CommentLine = createToken({ name: 'CommentLine', pattern: /\/\/.*/ });
const Dash = createToken({ name: 'Dash', pattern: /-/ });
const Comma = createToken({ name: 'Comma', pattern: /,/ });
const LBracket = createToken({ name: 'LBracket', pattern: /\[/ });
const RBracket = createToken({ name: 'RBracket', pattern: /]/ });
const Equals = createToken({ name: 'Equals', pattern: /=/ });
const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"[^"]*"/, line_breaks: true });
const QuotedIdentifier = createToken({ name: 'QuotedIdentifier', pattern: /'[^"]*'/, line_breaks: false });
const TrueLiteral = createToken({ name: 'TrueLiteral', pattern: /\btrue\b/ });
const FalseLiteral = createToken({ name: 'FalseLiteral', pattern: /\bfalse\b/ });
const NullLiteral = createToken({ name: 'NullLiteral', pattern: /\bnull\b/ });
const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_]\w*/ });
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /(\d*\.\d+|\d+\.?\d*)/ });
const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /\s+/, group: Lexer.SKIPPED });

const allTokens = [
  WhiteSpace, CommentLine, Hash, Slash, Dash, Comma, LBracket, RBracket, Equals, QuotedIdentifier, TrueLiteral, FalseLiteral, NullLiteral, StringLiteral, Identifier, NumberLiteral
];
const lexer = new Lexer(allTokens);

class MONParser extends CstParser {
  constructor() {
    super(allTokens);
    const $ = this;

    $.RULE('section', () => {
      $.MANY(() => {
        $.OR([
          { ALT: () => $.SUBRULE($.keyValue) },
          { ALT: () => $.SUBRULE($.arrayItem) },
          { ALT: () => $.SUBRULE($.value) }
        ]);
      });
    });

    $.RULE('keyValue', () => {
      $.OR([
        { ALT: () => $.CONSUME(QuotedIdentifier) },
        { ALT: () => $.CONSUME(Identifier) }
      ]);
      $.CONSUME(Equals);
      $.SUBRULE($.value);
    });

    $.RULE('arrayItem', () => {
      $.OR([
        { ALT: () => {
          $.CONSUME(Dash);
          $.SUBRULE($.value);
          }},
        { ALT: () => {
          $.CONSUME(Comma);
          $.SUBRULE2($.value);
          }},
        { ALT: () => {
          $.CONSUME2(Dash);
          $.SUBRULE($.keyValueSet);
          }},
        { ALT: () => {
          $.CONSUME2(Comma);
          $.SUBRULE2($.keyValueSet);
          }}
      ]);
    });

    $.RULE('bracketArray', () => {
      $.CONSUME(LBracket);
      $.OPTION(() => {
        $.SUBRULE($.value);
        $.MANY(() => {
          $.CONSUME(Comma);
          $.SUBRULE2($.value);
        });
      });
      $.CONSUME(RBracket);
    });

    $.RULE('value', () => {
      $.OR([
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.CONSUME(TrueLiteral) },
        { ALT: () => $.CONSUME(FalseLiteral) },
        { ALT: () => $.CONSUME(NullLiteral) },
        { ALT: () => $.SUBRULE($.bracketArray) }
      ]);
    });

    $.RULE('keyValueSet', () => {
      $.AT_LEAST_ONE(() => {
        $.SUBRULE($.keyValue);
      });
    });

    this.performSelfAnalysis();
  }
}

const parser = new MONParser();

function extractQuotedIdentifier(node) {
  return node.children.QuotedIdentifier[0].image.slice(1, -1);
}

function extractStringLiteral(node) {
  return node.children.StringLiteral[0].image.slice(1, -1);
}

function extractFloat(node) {
  return parseFloat(node.children.NumberLiteral[0].image);
}

function extractValue(node) {
  if (node.children.StringLiteral) return extractStringLiteral(node);
  if (node.children.NumberLiteral) return extractFloat(node);
  if (node.children.TrueLiteral) return true;
  if (node.children.FalseLiteral) return false;
  if (node.children.NullLiteral) return null;
  if (node.children.bracketArray) {
    return extractBracketArray(node.children.bracketArray[0]);
  }
  return undefined;
}

function extractBracketArray(arrayNode) {
  const items = [];
  arrayNode.children.value?.forEach(v => {
    items.push(extractValue(v));
  });
  return items;
}

function extractKeyValueSet(kvChildren) {
  const obj = {};
  kvChildren.keyValue.forEach(kv => {
    let key;
    if (kv.children.QuotedIdentifier) {
      key = extractQuotedIdentifier(kv);
    } else {
      key = kv.children.Identifier[0].image;
    }
    obj[key] = extractValue(kv.children.value[0]);
  });
  return obj;
}

function parseItem(sectionText) {
  const lexResult = lexer.tokenize(sectionText);
  if (lexResult.errors.length) throw new Error(lexResult.errors[0].message);
  parser.input = lexResult.tokens;
  const cst = parser.section();
  if (parser.errors.length) throw new Error(parser.errors[0].message);

  if (cst.children.keyValue) {
    return extractKeyValueSet(cst.children);
  }

  if (cst.children.arrayItem) {
    const items = [];
    let currentSubArray = null;

    for (const item of cst.children.arrayItem) {
      let value;

      if (item.children.keyValueSet) {
        value = extractKeyValueSet(item.children.keyValueSet[0].children);
      } else if (item.children.value) {
        value = extractValue(item.children.value[0]);
      }

      if (item.children.Dash) {
        if (currentSubArray) {
          items.push(currentSubArray.length === 1 ? currentSubArray[0] : currentSubArray);
        }
        currentSubArray = [value];
      } else if (item.children.Comma) {
        if (currentSubArray) {
          currentSubArray.push(value);
        } else {
          items.push(value);
        }
      }
    }

    if (currentSubArray) {
      items.push(currentSubArray.length === 1 ? currentSubArray[0] : currentSubArray);
    }

    return items;
  }

  if (cst.children.value) {
    return extractValue(cst.children.value[0]);
  }

  return {};
}

function parseSection(node, trust, root = null,
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
  for (const child of node.children) {
    let [cname, ctags] = child.name.split(' : ');
    ctags = ctags ? ctags.trim().split(/\s+/) : [];
    cname = cname.trim();
    
    if (!inTag) {
      for (let tag of tags) {
        let sts = subTags[tag][cname];
        if (sts) { ctags = ctags.concat(sts); }
      }
    }
    
    switch (child.nodeType) {
    case 'COMMENT':
    case 'TEMPLATE':
      continue;

    case 'TEXT':
      childData = child.content.join('\n');
      break;

    case 'CODE': {
      if (trust < 2) {
        console.log(`Code block in section "${cname}" skipped due to trust level.`);
        break;
      }

      const code = child.content.join('\n');
      try {
        const fn = new Function(trust >= 3 ? 'root' : '', code);
        const result = fn.call(obj, trust >= 3 ? root : undefined);
        childData = result;
      } catch (error) {
        console.error(`Error executing code in section "${cname}":`, error);
      }
      break;
    }
    
    case 'TAG': {
      if (trust < 3) {
        console.log(`Tag block in section "${cname}" skipped due to trust level.`);
        break;
      }
      let fn = null;
      const code = child.content.join('\n');
      try {
        fn = new Function('root', code);
      } catch (error) {
        console.error(`Error parsing code in section "${cname}":`, error);
      }
      if (fn) { tagCode[cname] = fn; }
      parseSection(child, trust, root || obj, ctags, tagCode, subTags, true);
      continue;
    }
    
    case 'NORMAL':
    default:
      if (inTag) {
        if (!subTags[node.name]) { subTags[node.name] = []; };
        let parent = subTags[node.name];
        if (!parent[cname]) { parent[cname] = []; }
        parent[cname] = parent[cname].concat(ctags);
      }
      childData = parseSection(child, trust, root || obj, ctags, tagCode, subTags, inTag);
      break;
    }

    if (childData) {      
      let destination = obj;
      const prefixes = cname.split('.');
      for (let i = 0; i < prefixes.length - 1; i++) {
        const prefix = (prefixes[i] === "[]") ? destination.length : prefixes[i];
        if (!destination[prefix]) {
          destination[prefix] = (prefixes[i + 1] === "[]") ? [] : {};
        }
        destination = destination[prefix];
      }
      
      if (prefixes.length > 0) {
        let prefix = prefixes[prefixes.length - 1];
        prefix = (prefix === "[]") ? destination.length : prefix;
        destination[prefix] = childData;
      } else {
        obj = childData;
      }
    }
  }
  
  for (let tag of tags) {
    let fn = tagCode[tag];
    if (fn) { fn.call(obj, root); }
  }

  return obj;
}

function countLeadingHashes(line) {
  let count = 0;
  while (line[count] === '#') count++;
  return count;
}

// main function
export function parseMON(text, trust = 1) {
  const lines = text.split('\n');
  let stack = [{ level: 0, name: '', content: [], children: [] }];
  let current = stack[0];
  let lastValidNodes = [];

  let commentLevel = 0;
  let textLevel = 0;

  // build hierarchy
  for (let line of lines) {
    line = line.trimStart();
    if (!line) continue;

    if (commentLevel) {
      if (line.startsWith('#') && (countLeadingHashes(line) <= commentLevel)) {
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
      
      let nodeType = 'NORMAL';
      let isComment = false;
      let isDitto = false;
      textLevel = 0;
      
      switch (line[level]) {
      case '/': isComment = true; nodeType = 'COMMENT'; break;
      case '"': textLevel = level; nodeType = 'TEXT'; break;
      case '=': isDitto = true; break;
      case ';': nodeType = 'CODE'; break;
      case ':': nodeType = 'TAG'; break;
      }

      if (isComment) {
        commentLevel = level;
        continue;
      }

      while (stack.length && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      current = stack[stack.length - 1];
      
      if (isDitto && current.children.length === 0) {
        isDitto = false;
        nodeType = 'TEMPLATE';
      }
      
      let headerLength = isDitto || (nodeType != 'NORMAL') ? level + 1 : level;
      let name = line.slice(headerLength).trim();
      const node = { level, name, content: [], children: [], nodeType };
      if (isDitto && trust > 0 && lastValidNodes[level]) {
        node.content = [...lastValidNodes[level].content];
        node.children = [...lastValidNodes[level].children];
      }

      stack.push(node);
      current.children.push(node);
      current = node;

      if (!isDitto
          && (nodeType === 'NORMAL' || nodeType === 'TEMPLATE')) {
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

  return parseSection(stack[0], trust);
}

