import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';

const sharedPlugins = [
  resolve(),
  commonjs(),
  esbuild({
    minify: true,
    target: 'esnext',
    mangleProps: /^_/,
  }),
];

export default [
  {
    input: 'monCore.js',
    output: {
      file: 'demo/monCore.bundle.js',
      format: 'iife',
      name: 'monCore',
      sourcemap: false,
    },
    plugins: [
      ...sharedPlugins,
      {
        name: 'expose-parseMON-web',
        renderChunk(code) {
          return {
            code: `${code}\nwindow.parseMON = monCore.parseMON;`,
            map: null,
          };
        },
      },
    ],
  },
  {
    input: 'monTool.js',
    output: {
      file: 'dist/mon.js',
      format: 'esm',
      sourcemap: false,
    },
    plugins: sharedPlugins,
  },
];
