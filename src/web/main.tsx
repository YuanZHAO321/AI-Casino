import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { installWebPlatform } from './platform'
import { installAudioUnlock } from '../ui/audio'
import App from '../App'
import '../ui/styles.css'

// 标记网页平台：CSS 据此去掉为 mac 标题栏预留的左 padding 等桌面专属样式
document.documentElement.dataset.platform = 'web'

// 必须在 React 挂载前安装 window.casino，src/ 全程依赖它访问平台能力
installWebPlatform()
// 移动浏览器需用户手势解锁音频，否则 BGM/TTS 被自动播放策略静默拦截
installAudioUnlock()

// 注册 Service Worker（资产服务 + 离线 app shell + 自动更新）
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
