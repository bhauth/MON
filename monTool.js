import * as fs from 'fs/promises';
import * as path from 'path';
import { parseMON } from './monCore.js';
import { objToMon } from './makeMon.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node monTool.js <input_filename1> <input_filename2> ...');
    console.log('Converts .mon files to .json and .json files to .mon');
    process.exit(1);
  }

  for (const inputFilename of args) {
    try {
      const inputText = await fs.readFile(inputFilename, 'utf8');
      const inputDir = path.dirname(inputFilename);
      const inputBaseName = path.basename(inputFilename, path.extname(inputFilename));
      const ext = path.extname(inputFilename).toLowerCase();
      let outputFilename, outputData;

      if (ext === '.mon') {
        // MON to JSON
        const dataObject = parseMON(inputText, 3);
        outputFilename = path.join(inputDir, `${inputBaseName}.json`);
        outputData = JSON.stringify(dataObject, null, 2);
        console.log(`Converted MON to JSON: '${outputFilename}'`);
      } else if (ext === '.json') {
        // JSON to MON
        const jsonObj = JSON.parse(inputText);
        outputFilename = path.join(inputDir, `${inputBaseName}.mon`);
        outputData = objToMon(jsonObj, { indentDepth: 2 });
        console.log(`Converted JSON to MON: '${outputFilename}'`);
      } else {
        console.error(`Skipping '${inputFilename}': Unsupported extension (use .mon or .json)`);
        continue;
      }

      await fs.writeFile(outputFilename, outputData, 'utf8');
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
