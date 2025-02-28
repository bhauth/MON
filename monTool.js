import * as fs from 'fs/promises';
import * as path from 'path';
import { parseMON } from './monCore.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node monTool.js <input_filename1> <input_filename2> ...');
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
