export default {
  server:{
    port: 99,
    host: true,
    open: true
  },
  build:{
    rollupOptions:{
      input:{
        index: 'index.html'
      }
    },
    assetsInlineLimit: 1024*1
  }
}