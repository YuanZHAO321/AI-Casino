import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { installWebPlatform } from './platform'
import App from '../App'
import '../ui/styles.css'

// 必须在 React 挂载前安装 window.casino，src/ 全程依赖它访问平台能力
installWebPlatform()

// 注册 Service Worker（资产服务 + 离线 app shell + 自动更新）
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
