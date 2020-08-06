// rollup.config.js
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import rootImport from 'rollup-plugin-root-import'

export default args => {
  const input = {
    'zeswarm.kernel': 'src/kernel.js',
    'zeswarm.config': 'src/config.js',
    main: 'src/main.js',
  }
  if (args.configMulti) {
    input.main = 'src/multi/main.js',
    input.zeswarm = 'src/main.js'
  }
  return {
    input,
    output: {
      dir: 'dist/',
      // file: 'dist/main.js',
      format: 'cjs',
      exports: 'named',
      chunkFileNames: 'zeswarm.[hash].js',
      preferConst: true,
    },
    manualChunks(id) {
      // process.stdout.write(id + '\n')
      if (id.includes('node_modules')) {
        return 'vendor'
      }
    },
    plugins: [
      {
        name: 'custom',
        banner: '/* ZeSwarm v1.1 */',
        renderChunk(code, info, opts) {
          code = code.replace(/require\('\.\/(.+?)\.js'\)/g, (m, f) => `require('${f}')`)
          return { code }
        },
        renderDynamicImport (c) {
          process.stdout.write(JSON.stringify(c, null, 2) + "\n")
          return {
            left: 'wtf(',
            right: '.slice(0, -3))'
          }
        }
      },
      rootImport({
        root: `${__dirname}/src`,
        useEntry: 'prepend',
        extensions: '.js'
      }),
      resolve({
        // module: true,
        preferBuiltins: false
      }),
      commonjs(),
    ]
  }
}
