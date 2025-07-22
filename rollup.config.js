// rollup.config.js
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import rootImport from 'rollup-plugin-root-import'
import typescript from '@rollup/plugin-typescript'

export default args => {
  const input = {
    'zeswarm.kernel': 'src/kernel.ts',
    'zeswarm.config': 'src/config.ts',
    main: 'src/main.ts',
  }
  if (args.configMulti) {
    input.main = 'src/multi/main.js'
    input.zeswarm = 'src/main.ts'
  }
  if (args.configTest) {
    input.main = 'src/main.test.js'
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
        banner: '/* ZeSwarm - https://github.com/ags131/ZeSwarm */',
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
        extensions: ['.js', '.ts']
      }),
      resolve({
        // module: true,
        preferBuiltins: false
      }),
      typescript(),
      commonjs(),
    ]
  }
}
