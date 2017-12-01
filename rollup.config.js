// rollup.config.js
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import rootImport from 'rollup-plugin-root-import';

export default {
  entry: 'src/index.js',
  plugins: [
    rootImport({
      root: `${__dirname}/src`,
      useEntry: 'prepend',
      extensions: '.js'
    }),
    commonjs(),
    resolve({
      module: true
    })
  ],
  targets: [
    { dest: 'dist/main.js', format: 'cjs' }
  ]
}
