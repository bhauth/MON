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
const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_]\w*/ });
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /(\d*\.\d+|\d+\.?\d*)/ });
const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /\s+/, group: Lexer.SKIPPED });

const allTokens = [
  WhiteSpace, CommentLine, Hash, Slash, Dash, Comma, LBracket, RBracket, Equals, StringLiteral, Identifier, NumberLiteral
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
          { ALT: () => $.SUBRULE($.arrayItem) }
        ]);
      });
    });

    $.RULE('keyValue', () => {
      $.CONSUME(Identifier);
      $.CONSUME(Equals);
      $.OR([
        { ALT: () => $.CONSUME(StringLiteral) },
        { ALT: () => $.CONSUME(NumberLiteral) },
        { ALT: () => $.SUBRULE($.bracketArray) }
      ]);
    });

    $.RULE('arrayItem', () => {
      $.OR([
        { ALT: () => {
          $.CONSUME(Dash);
          $.CONSUME(StringLiteral);
        }},
        { ALT: () => {
          $.CONSUME2(Dash);
          $.CONSUME(NumberLiteral);
        }},
        { ALT: () => {
          $.CONSUME3(Dash);
          $.SUBRULE($.bracketArray);
        }},
        { ALT: () => {
          $.CONSUME4(Dash);
          $.SUBRULE($.keyValueSet);
        }},
        { ALT: () => {
          $.CONSUME(Comma);
          $.CONSUME2(StringLiteral);
        }},
        { ALT: () => {
          $.CONSUME2(Comma);
          $.CONSUME2(NumberLiteral);
        }},
        { ALT: () => {
          $.CONSUME3(Comma);
          $.SUBRULE2($.bracketArray);
        }},
        { ALT: () => {
          $.CONSUME4(Comma);
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
    } else if (v.children.bracketArray) {
      items.push(extractBracketArray(v.children.bracketArray[0]));
    }
  });
  return items;
}

function countLeadingHashes(line) {
  let count = 0;
  while (line[count] === '#') count++;
  return count;
}

function parseSection(node) {
  if (node.isComment) return null;
  let obj = {};

  if (node.content.length) {
    const sectionText = node.content.join('\n');
    const lexResult = lexer.tokenize(sectionText);
    if (lexResult.errors.length) throw new Error(lexResult.errors[0].message);
    parser.input = lexResult.tokens;
    const cst = parser.section();
    if (parser.errors.length) throw new Error(parser.errors[0].message);

    if (cst.children.keyValue) {
      cst.children.keyValue.forEach(kv => {
        const key = kv.children.Identifier[0].image;
        let value;
        if (kv.children.StringLiteral) {
          value = extractStringLiteral(kv);
        } else if (kv.children.NumberLiteral) {
          value = extractFloat(kv);
        } else if (kv.children.bracketArray) {
          value = extractBracketArray(kv.children.bracketArray[0]);
        }
        obj[key] = value;
      });
    }

    if (cst.children.arrayItem) {
      const items = [];
      let currentSubArray = null;
      for (const item of cst.children.arrayItem) {
        let value;
        if (item.children.StringLiteral) {
          value = extractStringLiteral(item);
        } else if (item.children.NumberLiteral) {
          value = extractFloat(item);
        } else if (item.children.bracketArray) {
          value = extractBracketArray(item.children.bracketArray[0]);
        } else if (item.children.keyValueSet) {
          value = {};
          item.children.keyValueSet[0].children.keyValue.forEach(kv => {
            const key = kv.children.Identifier[0].image;
            if (kv.children.StringLiteral) {
              value[key] = extractStringLiteral(kv);
            } else if (kv.children.NumberLiteral) {
              value[key] = extractFloat(kv);
            } else if (kv.children.bracketArray) {
              value[key] = extractBracketArray(kv.children.bracketArray[0]);
            }
          });
        }
        if (item.children.Dash) {
          if (currentSubArray) {
            if (currentSubArray.length === 1) { items.push(currentSubArray[0]); }
            else { items.push(currentSubArray); }
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
        if (currentSubArray.length === 1) { items.push(currentSubArray[0]); }
        else { items.push(currentSubArray); }
      }
      obj = items;
    }
  }

  for (const child of node.children) {
    const childData = parseSection(child);
    const prefixes = child.name.split('.');
    let destination = obj;

    for (let i = 0; i < prefixes.length - 1; i++) {
      const prefix = (prefixes[i] === "[]") ?
        destination.length : prefixes[i];
      if (!destination[prefix]) {
        destination[prefix] =
          (prefixes[i+1] === "[]") ? [] : {};
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
function parseMON(text) {
  const lines = text.split('\n');
  let stack = [{ level: 0, name: '', content: [], children: [] }];
  let current = stack[0];
  let inCommentBlock = false;
  let commentLevel = 0;

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
        const isComment = line[level] === '/';
        const name = line.slice(isComment ? level + 1 : level).trim();
        while (stack.length && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        current = stack[stack.length - 1];
        const node = { level, name, content: [], children: [], isComment };
        current.children.push(node);
        if (!isComment) stack.push(node);
        current = node;
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

  return parseSection(stack[0]);
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
      const dataObject = parseMON(inputText);
      
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
