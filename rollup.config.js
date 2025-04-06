import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';

const sharedPlugins = [
  resolve(),
  commonjs(),
  esbuild({
    minify: true,
    target: 'esnext',
    mangleProps: /^_.+/,
  }),
];

export default [
  {
    input: 'monCore.js',
    output: {
      file: 'demo/monReader.js',
      format: 'iife',
      name: 'mon',
      sourcemap: false,
    },
    plugins: sharedPlugins,
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
