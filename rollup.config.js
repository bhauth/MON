import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';

export default {
  input: 'monCore.js',
  output: {
    file: 'demo/monCore.bundle.js',
    format: 'iife',
    name: 'monCore',
    sourcemap: false,
  },
  plugins: [
    resolve(),
    commonjs(),
    esbuild({
      minify: true,
      target: 'esnext',
    }),
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
};
