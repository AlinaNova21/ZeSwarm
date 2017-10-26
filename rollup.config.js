// rollup.config.js
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'

export default {
  entry: 'src/index.js',
  plugins: [
    commonjs(),
    resolve({
      module: true
    })
  ],
  targets: [
    { dest: 'dist/kernel.cjs.js', format: 'cjs' },
    { dest: 'dist/main.js', format: 'cjs' },
    { dest: 'dist/kernel.es.js', format: 'es' }
  ]
}
