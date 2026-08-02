import './polyfills'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import ElementPlusX from 'vue-element-plus-x'
import App from './App.vue'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'vue-element-plus-x/styles/index.css'
import './styles.css'

const app = createApp(App)

app.use(ElementPlus)
app.use(ElementPlusX)
app.mount('#app')
