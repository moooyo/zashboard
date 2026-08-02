import type { GpnInterception } from '@/api/gpn'
import { fetchInterceptionAPI } from '@/api/gpn'
import { activeUuid } from '@/store/setup'
import { ref } from 'vue'
import { featureSupported } from './capabilities'

/**
 * 拦截子系统的只读状态。
 *
 * 三态而非「数据 or null」:'absent' 与 'error' 必须分开。核心在引擎没装上时
 * 返回 503,那与「拦截已关闭」是两回事 —— 后者是一份加载成功并声明 enabled:false
 * 的文档,前者是一份根本没能加载的文档。把两者渲染成同一个界面,等于告诉操作者
 * 他的配置正在被遵守,而实际上没有人在读它。
 */
export type InterceptionStatus = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export const interceptionStatus = ref<InterceptionStatus>('idle')
export const interception = ref<GpnInterception | null>(null)
export const interceptionError = ref('')

export const interceptionSupported = featureSupported('gpn-interception')

// 与 capabilities 同样的双重护栏:代数挡住同一后端内的乱序响应,uuid 挡住
// 切换后端后旧后端的迟到响应。
let generation = 0
let controller: AbortController | undefined

export const refreshInterception = async () => {
  controller?.abort()
  controller = new AbortController()
  const gen = ++generation
  const uuid = activeUuid.value
  const stale = () => gen !== generation || uuid !== activeUuid.value

  if (!uuid) {
    interceptionStatus.value = 'idle'
    return
  }

  interceptionStatus.value = 'loading'
  interceptionError.value = ''

  let status = 0
  let data: GpnInterception | undefined
  try {
    const res = await fetchInterceptionAPI(controller.signal)
    status = res.status
    data = res.data
  } catch (e) {
    if (stale()) return
    interceptionStatus.value = 'error'
    interceptionError.value = e instanceof Error ? e.message : String(e)
    return
  }
  if (stale()) return

  if (status === 503) {
    interceptionStatus.value = 'absent'
    interception.value = null
    return
  }
  if (status !== 200 || !data) {
    interceptionStatus.value = 'error'
    interceptionError.value = `interception returned ${status}`
    return
  }

  interception.value = data
  interceptionStatus.value = 'ready'
}

export const stopInterception = () => {
  controller?.abort()
  controller = undefined
  generation++
  interception.value = null
  interceptionStatus.value = 'idle'
  interceptionError.value = ''
}
