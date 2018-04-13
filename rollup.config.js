// rollup.config.js
import commonjs from 'rollup-plugin-commonjs'
import screeps from 'rollup-plugin-screeps'
import resolve from 'rollup-plugin-node-resolve'
import rootImport from 'rollup-plugin-root-import'

let auth = false
try {
  auth = require('./auth.js')
} catch (e) {}
export default {
  input: 'src/index.js',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    exports: 'named',
    sourcemap: true
  },
  plugins: [
    rootImport({
      root: `${__dirname}/src`,
      useEntry: 'prepend',
      extensions: '.js'
    }),
    commonjs(),
    resolve({
      module: true
    }),
    screeps({
      dryRun: !auth,
      config: auth
    })
  ]
}
