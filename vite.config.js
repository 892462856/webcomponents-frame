
// vite.config.js
import { defineConfig } from 'vite'
import compression from 'vite-plugin-compression'
import { terser } from 'rollup-plugin-terser'
 
export default defineConfig({
  build: {
    lib: {
      entry: 'src/component.js', // 入口文件
      name: 'webcomponents-frame', // 库的名字
      formats: ['umd', 'es'],
      fileName: (format) => `component.mini.js`, // 输出文件名
    },
    rollupOptions: {
      output: {
        name: 'webcomponents-frame',
        exports: 'named',
        dir: 'packages'
      },
      plugins: [terser({compress:{
        drop_console: true,
        // collapse_whitespace: true 没有collapse_whitespace选项
      }})]
    },
    // minify: 'esbuild'//terser'
  },
  plugins: [
    // terser(),
    compression({
      verbose: true, // 是否在控制台输出压缩结果
      disable: false, // 是否禁用压缩
      algorithm: 'gzip', // 压缩算法
      threshold: 10240, // 压缩阈值，小于此大小的文件将不会被压缩
      minRatio: 0.5, // 压缩比例
      deleteOriginalAssets: false, // 是否删除原文件
    })
  ]
})