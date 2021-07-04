// import 在现代游览器上都能够根据正确的地址发起请求，然后 vite 服务进行拦截
import { createApp } from 'vue'; // 查找 node_module
import App from './App.vue'; // 解析成额外的 ?typetemplate 请求
import './index.css';

createApp(App).mount('#app');
