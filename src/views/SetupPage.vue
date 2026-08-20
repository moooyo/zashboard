<template>
  <div
    class="bg-base-200/50 h-full w-full items-center justify-center overflow-auto sm:flex"
    @keydown.enter="handleSubmit(form)"
  >
    <div class="absolute top-4 right-4 max-sm:hidden">
      <DashboardSettings />
    </div>
    <div class="absolute right-4 bottom-4 max-sm:hidden">
      <LanguageSelect />
    </div>
    <div
      class="border-base-border bg-base-100 mx-auto flex w-96 max-w-[90%] flex-col gap-3 rounded-xl border px-6 py-5 shadow-none max-sm:my-4"
    >
      <h1 class="mb-1 text-lg">{{ $t('setup') }}</h1>

      <BackendForm v-model="form" />

      <p class="text-base-content/60 text-xs">{{ $t('setupHostScopeHint') }}</p>

      <ReachabilityIndicator
        class="min-h-5"
        :status="reachability.status.value"
        :latency="reachability.latency.value"
        :message="reachability.message.value"
        @retry="reachability.retry"
      />

      <button
        class="btn btn-primary btn-sm w-full"
        :disabled="!canSubmit"
        @click="handleSubmit(form)"
      >
        <span
          v-if="isSubmitting"
          class="loading loading-spinner loading-xs"
        ></span>
        {{ isSubmitting ? $t('backendConnecting') : $t('submit') }}
      </button>

      <!-- 已经存过后端却落到这里(当前后端被删、或存档里的 uuid 失效),
           给一条回到管理面板的路,而不是逼他把地址重填一遍。 -->
      <button
        v-if="backendList.length"
        class="btn btn-ghost btn-sm w-full"
        @click="openBackendManager()"
      >
        {{ $t('manageBackends') }}
      </button>

      <div class="mt-4 sm:hidden">
        <LanguageSelect />
      </div>
      <div class="absolute top-2 right-2 sm:hidden">
        <DashboardSettings />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isBackendAvailable, probeBackend } from '@/assembly/backend'
import DashboardSettings from '@/components/common/DashboardSettings.vue'
import ReachabilityIndicator from '@/components/common/ReachabilityIndicator.vue'
import BackendForm from '@/components/settings/backend/BackendForm.vue'
import LanguageSelect from '@/components/settings/general/LanguageSelect.vue'
import { ROUTE_NAME } from '@/constant'
import { syncSettingsFromCore } from '@/helper/autoImportSettings'
import { useBackendReachability } from '@/composables/backendReachability'
import { describeProbeFailure } from '@/helper/connectivity'
import { showNotification } from '@/helper/notification'
import {
  getServedOriginDefaults,
  startSetupHandoff,
  subscribeSetupHandoff,
  takeSetupHandoff,
} from '@/helper/setupHandoff'
// 上游的 getBackendFromUrl 有意不在这里出现:URL 下发后端已整体换成
// helper/setupHandoff(见 helper/utils.ts 里的说明),不要从上游合回来。
import { getBackendProbeUrl } from '@/helper/utils'
import router from '@/router'
import { addBackend, backendList, openBackendManager } from '@/store/setup'
import type { Backend, BackendType } from '@/types'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * The first backend defaults to the origin serving this page.
 *
 * The upstream default, http://127.0.0.1:9090, assumes the panel is hosted elsewhere and the
 * backend is local. 5gpn is the opposite: the controller serves the bundle through external-ui,
 * so the panel and API always share an origin. All three defaults are therefore wrong here: the
 * protocol is wrong because the controller is TLS-only and external-controller is empty, the host
 * is wrong because 127.0.0.1 means the operator's computer to the browser, and the port is wrong
 * because the controller listens on 443. Silent automatic submission with an empty backend list
 * must consequently fail, and fail silently: the list remains empty, capability discovery never
 * starts, featureSupported stays false, and renderRoutes filters every 5gpn page, making the UI
 * look like an unmodified zashboard.
 *
 * Same-origin is the only answer that requires no guess. Non-HTTP(S) contexts such as file:// have
 * no usable origin and fall back to the upstream default.
 */
const served = getServedOriginDefaults()

const form = ref<Omit<Backend, 'uuid'>>({
  type: 'clash' as BackendType,
  protocol: served?.protocol ?? 'http',
  host: served?.host ?? '127.0.0.1',
  port: served?.port ?? '9090',
  secondaryPath: '',
  password: '',
  rememberSecret: false,
  label: '',
})

// 填表期间就持续探测:通不通、为什么不通,在按提交之前就该看得见。
const reachability = useBackendReachability(form)

const isSubmitting = ref(false)
const canSubmit = computed(() => reachability.status.value === 'online' && !isSubmitting.value)

type SetupForm = Omit<Backend, 'uuid'>

const finishLogin = async (replaceCurrentEntry = false) => {
  if (replaceCurrentEntry) {
    await router.replace({ name: ROUTE_NAME.proxies })
  }

  try {
    const synced = await syncSettingsFromCore()
    if (synced) return
  } catch (error) {
    console.error('Failed to sync settings after login:', error)
  }
  if (!replaceCurrentEntry) {
    await router.push({ name: ROUTE_NAME.proxies })
  }
}

// 提交 = 再确认一次连通性后存下并进入面板。
// 失败不再弹 alert:原因写在表单里的可达性指示器上,用户改哪个字段一目了然。
const handleSubmit = async (setupForm: SetupForm, quiet = false) => {
  const { protocol, host, port } = setupForm

  if (!protocol || !host || !port) return
  if (isSubmitting.value) return

  if (
    window.location.protocol === 'https:' &&
    protocol === 'http' &&
    !['::1', '0.0.0.0', '127.0.0.1', 'localhost'].includes(host) &&
    !quiet
  ) {
    showNotification({ content: 'protocolTips' })
  }

  isSubmitting.value = true

  try {
    const result = await probeBackend({ uuid: '', ...setupForm })

    if (!result.ok) {
      // 表单自身的失败已经由指示器呈现,让它重探一轮拿到最新结论即可;
      // URL 带来的后端不在表单里,只能单独提示。
      if (setupForm === form.value) {
        reachability.retry()
      } else if (!quiet) {
        showNotification({
          content: await describeProbeFailure(result, getBackendProbeUrl(setupForm)),
          type: 'alert-error',
        })
      }
      return
    }

    addBackend(setupForm)
    await finishLogin()
  } finally {
    isSubmitting.value = false
  }
}

let handoffGeneration = 0

const processPendingSetupHandoff = () => {
  const handoff = takeSetupHandoff()
  if (handoff.kind === 'absent') return false

  const generation = ++handoffGeneration
  if (handoff.kind === 'invalid') {
    alert(t('setupLinkInvalid'))
    return true
  }

  const setupHandoff = startSetupHandoff(handoff, {
    prepare: (backend) => {
      Object.assign(form.value, backend, { rememberSecret: false })
    },
    probe: async (backend) => {
      const available = await isBackendAvailable({ uuid: '', ...backend }, 10000)
      return generation === handoffGeneration && available
    },
    persist: addBackend,
    navigate: () => finishLogin(true),
  })
  if (setupHandoff.kind !== 'ready') return true

  void setupHandoff.completion.then((result) => {
    if (generation === handoffGeneration && result.kind === 'failed') {
      alert(t('backendConnectionFailed'))
    }
  })
  return true
}

const unsubscribeSetupHandoff = subscribeSetupHandoff(processPendingSetupHandoff)
onUnmounted(() => {
  handoffGeneration++
  unsubscribeSetupHandoff()
})

// 分发链接优先:它带着一个明确的后端,别让默认地址的自动登录抢在前面。
if (!processPendingSetupHandoff() && backendList.value.length === 0) {
  // 一个后端都没有时,默认地址本来就通就别再让用户点一次 ——
  // 但只认首轮探测的结论,之后一律以用户的操作为准。
  //
  // 这一层探测门在 5gpn 上尤其要紧:同源默认值不通时(见上面 served 的说明),
  // 以前是静默提交、静默失败,页面停在原地也不说为什么。
  const stopAutoLogin = watch(
    () => reachability.status.value,
    (status) => {
      if (status === 'checking') return
      stopAutoLogin()
      if (status === 'online') handleSubmit(form.value, true)
    },
  )
}
</script>
