/**
 * 健壮的浏览器文件选择。旧实现用 window focus + setTimeout 判定取消，在 iOS Safari
 * （标签页 vs 独立 PWA 焦点时机不同）会在 change 之前抢先 resolve(null) 导致“导入失败”。
 * 现在只信任两个可靠信号：change（选到文件）与现代浏览器的 cancel 事件（取消）。
 * 都不触发就让 Promise 悬着（不报错），由用户重试。
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    let settled = false
    const settle = (f: File | null): void => {
      if (settled) return
      settled = true
      // 延迟移除：部分 iOS 版本过早移除 input 会丢掉 File 句柄
      setTimeout(() => input.remove(), 0)
      resolve(f)
    }
    input.onchange = () => settle(input.files?.[0] ?? null)
    // oncancel：Safari 16+/Chrome/Firefox 现代版均支持；旧浏览器不触发也无害
    input.oncancel = () => settle(null)
    document.body.appendChild(input)
    input.click()
  })
}
