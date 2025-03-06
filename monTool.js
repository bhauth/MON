import * as fs from 'fs/promises';
import * as path from 'path';
import { parseMON } from './monCore.js';
import { objToMon } from './makeMon.js';


async function loadMON(fileSpecs) {
  let combined = {};
  let allTags = [];
  let allTagCode = {};
  let allSubTags = {};

  for (const [filePath, params = {}] of fileSpecs) {
    const trust = parseInt(params.trust || '3', 10);
    const inputText = await fs.readFile(filePath, 'utf8');
    const baseName = path.basename(filePath, path.extname(filePath));

    const data = parseMON(inputText, trust, trust >= 3 ? combined : null, allTags, allTagCode, allSubTags);
    if (fileSpecs.length > 1) {
      combined[baseName] = data;
    } else { combined = data; }
  }

  return combined;
}

async function processFiles(fileArg) {
  const chunks = fileArg.split('}').filter(Boolean);

  const fileSpecs = chunks.map(chunk => {
    const [filePath, paramStr = ''] = chunk.split('{');
    const params = paramStr.trim().split(' ').reduce((acc, pair) => {
      const [key, value] = pair.split('=');
      if (key && value) acc[key] = value;
      return acc;
    }, {});
    return [filePath.trim(), params];
  });

  const allMon = fileSpecs.every(([file]) => path.extname(file).toLowerCase() === '.mon');
  const singleJson = fileSpecs.length === 1 && path.extname(fileSpecs[0][0]).toLowerCase() === '.json';

  if (allMon) {
    const combined = await loadMON(fileSpecs);
    const outputDir = path.dirname(fileSpecs[0][0]);
    const outputFile = fileSpecs.length > 1
      ? path.join(outputDir, 'combined.json')
      : path.join(outputDir, `${path.basename(fileSpecs[0][0], '.mon')}.json`);
    const outputData = JSON.stringify(combined, null, 2);

    await fs.writeFile(outputFile, outputData, 'utf8');
    console.log(`Converted ${fileSpecs.length > 1 ? 'MON files' : 'MON file'} to '${outputFile}'`);
    return outputFile;
  } else if (singleJson) {
    const [filePath] = fileSpecs[0];
    const inputText = await fs.readFile(filePath, 'utf8');
    const inputDir = path.dirname(filePath);
    const inputBase = path.basename(filePath, '.json');
    const jsonObj = JSON.parse(inputText);
    const outputFile = path.join(inputDir, `${inputBase}.mon`);
    const outputData = objToMon(jsonObj, { indentDepth: 2 });

    await fs.writeFile(outputFile, outputData, 'utf8');
    console.log(`Converted JSON to MON: '${outputFile}'`);
    return outputFile;
  } else {
    throw new Error(`Invalid input: "${fileArg}" - Use multiple .mon files or a single .json file`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Usage: node monTool.js "file1.mon" "file2.mon"');
    console.log('   or: node monTool.js "schema.mon{params}data.mon{params}"');
    console.log('   or: node monTool.js "input.json"');
    console.log('Converts .mon file sets to .json files, or .json files to .mon');
    console.log('Note: Filenames must not contain { or }');
    process.exit(1);
  }

  for (const arg of args) {
    try {
      await processFiles(arg);
    } catch (err) {
      console.error(`Error processing "${arg}": ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
