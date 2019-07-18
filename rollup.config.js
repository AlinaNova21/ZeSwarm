// rollup.config.js
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import rootImport from 'rollup-plugin-root-import'

export default {
  input: 'src/main.js',
  output: {
    dir: 'dist/',
    // file: 'dist/main.js',
    format: 'cjs',
    exports: 'named'
    // sourcemap: true
  },
  plugins: [
    rootImport({
      root: `${__dirname}/src`,
      useEntry: 'prepend',
      extensions: '.js'
    }),
    resolve({
      module: true,
      preferBuiltins: false
    }),
    commonjs(),
    // {
    //   name: 'custom',
    //   resolveFileUrl ({ fileName, assetReferenceId, chunkRefereceId }) {
    //     console.log(fileName, assetReferenceId, chunkRefereceId)
    //     return 'abc' + fileName.slice(0, -3)
    //   },
    //   resolveImportMeta (prop, { chunkId, moduleId, format }) {
    //     return moduleId + 'abc'
    //   }
    // }
  ]
}
