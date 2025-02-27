import * as fs from 'fs/promises';
import * as path from 'path';
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
const TrueLiteral = createToken({ name: 'TrueLiteral', pattern: /\btrue\b/ });
const FalseLiteral = createToken({ name: 'FalseLiteral', pattern: /\bfalse\b/ });
const NullLiteral = createToken({ name: 'NullLiteral', pattern: /\bnull\b/ });
const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_]\w*/ });
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /(\d*\.\d+|\d+\.?\d*)/ });
const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /\s+/, group: Lexer.SKIPPED });

const allTokens = [
  WhiteSpace, CommentLine, Hash, Slash, Dash, Comma, LBracket, RBracket, Equals, TrueLiteral, FalseLiteral, NullLiteral, StringLiteral, Identifier, NumberLiteral
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
      $.CONSUME(Identifier);
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


function extractStringLiteral(node) {
  return node.children.StringLiteral[0].image.slice(1, -1);
}

function extractFloat(node) {
  return parseFloat(node.children.NumberLiteral[0].image);
}

function extractBracketArray(arrayNode) {
  const items = [];
  arrayNode.children.value?.forEach(v => {
    if (v.children.StringLiteral) {
      items.push(extractStringLiteral(v));
    } else if (v.children.NumberLiteral) {
      items.push(extractFloat(v));
    } else if (v.children.TrueLiteral) {
      items.push(true);
    } else if (v.children.FalseLiteral) {
      items.push(false);
    } else if (v.children.NullLiteral) {
      items.push(null);
    } else if (v.children.bracketArray) {
      items.push(extractBracketArray(v.children.bracketArray[0]));
    }
  });
  return items;
}

function extractValue(node) {
  if (node.children.StringLiteral) {
    return extractStringLiteral(node);
  } else if (node.children.NumberLiteral) {
    return extractFloat(node);
  } else if (node.children.TrueLiteral) {
    return true;
  } else if (node.children.FalseLiteral) {
    return false;
  } else if (node.children.NullLiteral) {
    return null;
  } else if (node.children.bracketArray) {
    return extractBracketArray(node.children.bracketArray[0]);
  }
  return undefined;
}


function countLeadingHashes(line) {
  let count = 0;
  while (line[count] === '#') count++;
  return count;
}

const NodeType = {
  TEMPLATE: 'TEMPLATE',
  CODE: 'CODE',
  COMMENT: 'COMMENT',
  NORMAL: 'NORMAL',
};

function parseItem(sectionText) {
  const lexResult = lexer.tokenize(sectionText);
  if (lexResult.errors.length) throw new Error(lexResult.errors[0].message);
  parser.input = lexResult.tokens;
  const cst = parser.section();
  if (parser.errors.length) throw new Error(parser.errors[0].message);

  let obj = {};

  if (cst.children.keyValue) {
    cst.children.keyValue.forEach(kv => {
      const key = kv.children.Identifier[0].image;
      obj[key] = extractValue(kv.children.value[0]);
    });
  }

  if (cst.children.arrayItem) {
    const items = [];
    let currentSubArray = null;
    for (const item of cst.children.arrayItem) {
      let value;
      if (item.children.keyValueSet) {
        value = {};
        item.children.keyValueSet[0].children.keyValue.forEach(kv => {
          const key = kv.children.Identifier[0].image;
          value[key] = extractValue(kv.children.value[0]);
        });
      } else if (item.children.value) {
        value = extractValue(item.children.value[0]);
      }
      
      if (item.children.Dash) {
        if (currentSubArray) {
          if (currentSubArray.length === 1) {
            items.push(currentSubArray[0]);
          } else {
            items.push(currentSubArray);
          }
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
      if (currentSubArray.length === 1) {
        items.push(currentSubArray[0]);
      } else {
        items.push(currentSubArray);
      }
    }
    obj = items;
  }

  if (cst.children.value) {
    const values = cst.children.value.map((v) => {
      return extractValue(v);
    });
    obj = values.length === 1 ? values[0] : values;
  }

  return obj;
}

function parseSection(node, trust, root = null) {
  switch (node.nodeType) {
    case NodeType.COMMENT:
    case NodeType.CODE:
      return null;
    default: break;
  }
  
  let obj = {};
  if (node.content.length) {
    obj = parseItem(node.content.join('\n'));
  }
  
  let childData = {};
  for (const child of node.children) {
    switch (child.nodeType) {
      
      case NodeType.TEMPLATE:
        continue;
      
      case NodeType.CODE:
        if (trust >= 2) {
          const code = child.content.join('\n');
          try {
            const fn = new Function(trust >= 3 ? 'root' : '', code);
            const result = fn.call(obj, trust >= 3 ? root : undefined);
            if (result !== undefined) {
              childData = result;
            }
          } catch (error) {
            console.error('Error executing code block:', error);
          }
        } else {
          console.log('Code block skipped due to trust level.');
        }
        break;

      case NodeType.NORMAL:
      default:
      childData = parseSection(child, trust, root || obj);
      break;
    }

    let destination = obj;
    const prefixes = child.name.split('.');
    for (let i = 0; i < prefixes.length - 1; i++) {
      const prefix = (prefixes[i] === "[]") ? destination.length : prefixes[i];
      if (!destination[prefix]) {
        destination[prefix] = (prefixes[i + 1] === "[]") ? [] : {};
      }
      destination = destination[prefix];
    }
    
    if (childData) {
      const last_i = prefixes.length - 1;
      if (prefixes.length > 0) {
        let prefix = prefixes[prefixes.length - 1];
        prefix = (prefix === "[]") ? destination.length : prefix;
        destination[prefix] = childData;
      } else {
        obj = childData;
      }
    }
  }

  return obj;
}

// main function
function parseMON(text, trust = 1) {
  const lines = text.split('\n');
  let stack = [{ level: 0, name: '', content: [], children: [] }];
  let current = stack[0];
  let inCommentBlock = false;
  let commentLevel = 0;
  let lastValidNodes = [];

  // build hierarchy
  for (let line of lines) {
    line = line.trimStart();
    if (!line) continue;

    if (inCommentBlock) {
      if (line.startsWith('#')) {
        const level = countLeadingHashes(line);
        if (level <= commentLevel) inCommentBlock = false;
        else continue;
      } else {
        continue;
      }
    }

    switch (line[0]) {
      case '#':
        const level = countLeadingHashes(line);
        const firstChar = line[level];
        
        const isComment = firstChar === '/';
        let isDitto = firstChar === "'";
        let isTemplate = false;
        let isCode = firstChar === ":";

        while (stack.length && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        current = stack[stack.length - 1];
        
        if (isDitto && current.children.length === 0) {
          isDitto = false;
          isTemplate = true;
        }
        
        let nodeType = isComment ? NodeType.COMMENT :
          isTemplate ? NodeType.TEMPLATE :
          isCode ? NodeType.CODE :
          NodeType.NORMAL;

        let headerLength = isDitto || (nodeType != NodeType.NORMAL) ? level + 1 : level;
        let name = line.slice(headerLength).trim();
        const node = { level, name, content: [], children: [], nodeType };
        if (isDitto && trust > 0 && lastValidNodes[level]) {
          node.content = [...lastValidNodes[level].content];
          node.children = [...lastValidNodes[level].children];
        }

        if (!isComment) {
          stack.push(node);
          current.children.push(node);
        }
        current = node;

        if (!isDitto
            && (nodeType === NodeType.NORMAL || nodeType === NodeType.TEMPLATE)) {
          lastValidNodes[level] = node;
        }

        if (isComment) {
          inCommentBlock = true;
          commentLevel = level;
        }
        break;

      case '/':
        if (line.startsWith('//')) continue;
        if (!inCommentBlock) current.content.push(line);
        break;

      case '-':
      case ',':
      default:
        if (!inCommentBlock) current.content.push(line);
        break;
    }
  }

  return parseSection(stack[0], trust);
}


async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node monConverter.js <input_filename1> <input_filename2> ...');
    process.exit(1);
  }

  for (const inputFilename of args) {
    try {
      const inputText = await fs.readFile(inputFilename, 'utf8');
      const dataObject = parseMON(inputText, 3);
      
      const inputDir = path.dirname(inputFilename);
      const inputBaseName = path.basename(inputFilename, path.extname(inputFilename));
      const outputFilename = path.join(inputDir, `${inputBaseName}.json`);
      await fs.writeFile(outputFilename, JSON.stringify(dataObject, null, 2), 'utf8');
      console.log(`JSON written to '${outputFilename}'`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`Error: File '${inputFilename}' not found.`);
      } else {
        console.error(`An error occurred processing '${inputFilename}': ${err.message}`);
      }
    }
  }
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
