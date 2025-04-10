import * as fs from 'fs/promises';
import * as path from 'path';
import { parseMon } from './monCore.js';
import { objToMon } from './makeMon.js';


async function loadMon(fileSpecs, bags = null) {
  let combined = {};
  let tagCode = {};
  let subTags = {};

  for (const [filePath, params = {}] of fileSpecs) {
    const trust = parseInt(params.trust || '3', 10);
    let parentTags = params.tag ? [params.tag] : [];
    const inputText = await fs.readFile(filePath, 'utf8');
    const baseName = path.basename(filePath, path.extname(filePath));

    const data = parseMon(inputText, trust, bags,
        trust >= 3 ? combined : null,
        parentTags, tagCode, subTags);
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

  const [lastFile, lastParams = {}] = fileSpecs[fileSpecs.length - 1];
  const outputDir = path.dirname(lastFile);
  const ext = path.extname(lastFile);
  const baseName = path.basename(lastFile, ext);
  
  // allow a nonexistent last file to specify destination
  // set indent based on last file params
  if (fileSpecs.length > 1) {
    const lastFileExists = await fs.access(lastFile)
      .then(() => true)
      .catch(err => err.code === 'ENOENT' ? false : Promise.reject(err));
    if (!lastFileExists) { fileSpecs.pop(); }
  }

  const allMon = fileSpecs.every(([file]) => {
    const ext = path.extname(file).toLowerCase();
    return ext === '.mon' || ext === '.md';
  });
  const singleJson = fileSpecs.length === 1 && path.extname(fileSpecs[0][0]).toLowerCase() === '.json';

  if (allMon) {
    const outputFile = path.join(outputDir, `${baseName}.json`);
    
    let bagsFile = lastParams.bags;
    let bags = null;
    if (bagsFile) {
      bags = {};
      bagsFile = path.join(outputDir, `${bagsFile}.json`);
    }
    
    const combined = await loadMon(fileSpecs, bags);
    let indent = parseInt(lastParams.indent) || 2;
    const outputData = JSON.stringify(combined, null, indent);
    
    await fs.writeFile(outputFile, outputData, 'utf8');
    let bagNotice = '';
    if (bagsFile) {
      const bagText = JSON.stringify(bags, null, indent);
      await fs.writeFile(bagsFile, bagText, 'utf8');
      bagNotice = ` and '${bagsFile}'`;
    }
    
    console.log(`Converted ${fileSpecs.length > 1 ? 'MON files' : 'MON file'} to '${outputFile}'${bagNotice}`);
    return outputFile;
  } else if (singleJson) {
    const outputFile = path.join(outputDir, `${baseName}.mon`);
    const [filePath, params = {}] = fileSpecs[0];
    const inputText = await fs.readFile(filePath, 'utf8');
    const jsonObj = JSON.parse(inputText);
    const outputData = objToMon(jsonObj, params);
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
console.log(`Converts .mon file sets to .json files, or .json files to .mon

Usage: node monTool.js "file1.mon" "file2.mon{params}file3.mon{params}"
  or: node monTool.js "input1.json" "input2.json"
  
Note: Filenames must not contain { or }

Parameters: {trust=int indent=int tag=string bags=filename}`);
    process.exit(1);
  }

await Promise.all(args.map(async (arg) => {
    try {
      await processFiles(arg);
    } catch (err) {
      console.error(`Error processing "${arg}"\n${err.message}`);
    }
  }));
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
