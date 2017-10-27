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
    { dest: 'dist/main.js', format: 'cjs' }
  ]
}
