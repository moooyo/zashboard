<template>
  <div class="relative size-full overflow-x-hidden">
    <div
      class="flex flex-col gap-3 p-3"
      :style="padding"
    >
      <div
        v-if="interceptionStatus === 'absent'"
        class="alert alert-warning"
      >
        <span>{{ $t('gpnInterceptionAbsent') }}</span>
      </div>
      <div
        v-else-if="interceptionStatus === 'error'"
        class="alert alert-error"
      >
        <span>{{ interceptionError }}</span>
      </div>

      <template v-if="data">
        <div
          v-if="notice"
          class="alert"
          :class="noticeIsError ? 'alert-error' : 'alert-success'"
        >
          <span>{{ notice }}</span>
        </div>

        <!-- SAN 集与已启用扩展要求捕获的集合不符,是唯一一个在客户端表现为信任
             错误、而网关日志里什么都没有的故障。它必须比其他任何一行都显眼。 -->
        <div
          v-if="certificateGap"
          class="alert alert-error"
        >
          <span>{{
            $t('gpnCertificateGap', { hosts: (data.certificate.missing_hosts ?? []).join(', ') })
          }}</span>
        </div>

        <div class="base-container flex flex-wrap items-center gap-4 p-3">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              class="toggle toggle-sm"
              :checked="data.enabled"
              @change="toggleMaster"
            />
            <span class="text-sm font-medium">{{ $t('gpnMitmMaster') }}</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              class="toggle toggle-sm"
              :checked="data.http2"
              @change="toggleHttp2"
            />
            <span class="text-sm">{{ $t('gpnHttp2') }}</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              class="toggle toggle-sm"
              :checked="data.http3"
              @change="toggleHttp3"
            />
            <span class="text-sm">{{ $t('gpnHttp3') }}</span>
          </label>
          <span class="text-xs opacity-70">
            {{ $t('gpnModuleCount', { enabled: enabledCount, total: data.modules.length }) }} ·
            {{ $t('gpnCaptureHosts') }}: {{ data.active_capture_hosts.length }}
          </span>
        </div>

        <!-- 目录。它只是一份 manifest 清单:点「审阅」走的仍然是审阅 → 确认
             digest → 安装那条路,digest 由重新抓取 manifest 算出,不是目录说了算。
             所以这里没有「一键安装」。 -->
        <div class="base-container flex flex-col gap-2 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">{{ $t('gpnCatalog') }}</span>
            <button
              class="btn btn-xs"
              :disabled="catalogStatus === 'loading'"
              @click="refreshCatalog(true)"
            >
              {{ $t('gpnCatalogRefresh') }}
            </button>
            <span
              v-if="catalogStatus === 'loading'"
              class="loading loading-spinner loading-xs"
            />
          </div>

          <div
            v-if="catalogError"
            class="alert alert-error py-2"
          >
            <span>{{ catalogError }}</span>
          </div>

          <div
            v-for="source in catalogSources"
            :key="source.id"
            class="flex flex-col gap-2"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs opacity-70">
              <span>{{ source.metadata?.name || source.name || source.id }}</span>
              <span
                v-if="!source.enabled"
                class="badge badge-ghost badge-xs"
                >{{ $t('gpnDisabled') }}</span
              >
              <span
                v-else-if="source.error"
                class="badge badge-error badge-xs"
                >{{ source.error }}</span
              >
              <span v-else>{{ source.entries.length }}</span>
            </div>

            <div
              v-for="entry in source.entries"
              :key="entry.id"
              class="flex flex-wrap items-center gap-2 pl-2 text-sm"
            >
              <span class="font-medium">{{ entry.name || entry.id }}</span>
              <span class="badge badge-ghost badge-sm">{{ entry.version }}</span>
              <span
                v-if="entry.installed_version === entry.version"
                class="badge badge-success badge-sm"
                >{{ $t('gpnInstalled') }}</span
              >
              <span
                v-else-if="entry.installed_version"
                class="badge badge-info badge-sm"
                >{{ $t('gpnUpdateFrom', { from: entry.installed_version }) }}</span
              >
              <span
                v-if="entry.capabilities?.network"
                class="badge badge-warning badge-sm"
                >{{ $t('gpnNetworkGrant') }}</span
              >
              <span class="flex-1 truncate text-xs opacity-70">{{ entry.description }}</span>
              <button
                class="btn btn-xs"
                :disabled="reviewing || busy"
                @click="reviewEntry(source.id, entry.id)"
              >
                {{ $t('gpnReview') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 导入 -->
        <div class="base-container flex flex-col gap-2 p-3">
          <div class="flex flex-wrap items-end gap-2">
            <label class="flex flex-1 flex-col gap-1">
              <span class="text-sm font-medium">{{ $t('gpnImportUrl') }}</span>
              <input
                v-model="importUrl"
                class="input input-sm w-full"
                placeholder="https://example.com/extension.yaml"
              />
            </label>
            <button
              class="btn btn-sm"
              :disabled="reviewing || (!importUrl && !importContent)"
              @click="review"
            >
              {{ $t('gpnReview') }}
            </button>
          </div>
          <details>
            <summary class="cursor-pointer text-xs opacity-70">
              {{ $t('gpnPasteManifest') }}
            </summary>
            <textarea
              v-model="importContent"
              class="textarea textarea-sm mt-2 w-full font-mono"
              rows="6"
            />
          </details>
        </div>

        <!-- 审阅。启用之前操作者要看到的全部影响都在这里,而不是分散在几次确认里。 -->
        <div
          v-if="candidate"
          class="base-container border-warning flex flex-col gap-2 border p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-base font-medium">
              {{ candidate.detail.name || candidate.detail.id }}
            </span>
            <span class="badge badge-sm">{{ candidate.detail.version }}</span>
            <span
              v-if="candidate.installedVersion"
              class="badge badge-info badge-sm"
            >
              {{ $t('gpnUpdateFrom', { from: candidate.installedVersion }) }}
            </span>
          </div>
          <p
            v-if="candidate.detail.description"
            class="text-sm opacity-80"
          >
            {{ candidate.detail.description }}
          </p>

          <div class="settings-grid">
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnCaptureHosts') }}</span>
              <span class="font-mono text-xs">{{ candidate.detail.capture_hosts.join(', ') }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnActions') }}</span>
              <span>{{ (candidate.detail.actions ?? []).length }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnStorage') }}</span>
              <span>{{
                $t(candidate.detail.persistent_storage ? 'gpnEnabled' : 'gpnDisabled')
              }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnRoutingRules') }}</span>
              <span>{{ (candidate.detail.routing_rules ?? []).length }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnDigest') }}</span>
              <span class="font-mono text-xs">{{ candidate.digest.slice(0, 16) }}</span>
            </div>
          </div>

          <!-- 这个授权不带目的地清单。把它写成一组「已审阅的目标」会是在描述一条
               并不存在的边界,所以每个界面都必须说「任何它能到达的主机」。 -->
          <div
            v-if="candidate.detail.network"
            class="alert alert-warning py-2"
          >
            <span>{{ $t('gpnNetworkGrantWarning') }}</span>
          </div>

          <div class="flex gap-2">
            <button
              class="btn btn-primary btn-sm"
              :disabled="busy"
              @click="install"
            >
              {{ $t(candidate.installed ? 'gpnApplyUpdate' : 'gpnInstall') }}
            </button>
            <button
              class="btn btn-sm"
              @click="candidate = null"
            >
              {{ $t('gpnCancel') }}
            </button>
          </div>
          <p class="text-xs opacity-70">{{ $t('gpnInstallLandsDisabled') }}</p>
        </div>

        <div
          v-if="reviewError"
          class="alert alert-error"
        >
          <span>{{ reviewError }}</span>
        </div>

        <!-- 已安装。顺序即优先级:重叠捕获主机归执行顺序里靠前的那个扩展所有,
             它同时决定动作组合、egress 与源站解析组。 -->
        <div class="flex flex-col gap-2">
          <div
            v-for="(module, index) in orderedModules"
            :key="module.id"
            class="base-container flex flex-col gap-2 p-3"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="w-6 text-center text-xs opacity-60">{{ index + 1 }}</span>
              <input
                type="checkbox"
                class="toggle toggle-sm"
                :checked="module.enabled"
                :disabled="busy"
                @change="toggleModule(module)"
              />
              <span class="font-medium">{{ module.name || module.id }}</span>
              <span class="badge badge-ghost badge-sm">{{ module.version }}</span>
              <span
                v-if="module.egress_group_required && !module.egress_group"
                class="badge badge-error badge-sm"
              >
                {{ $t('gpnUnboundEgress') }}
              </span>
              <div class="ml-auto flex gap-1">
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="index === 0 || busy"
                  @click="moveModule(index, -1)"
                >
                  ↑
                </button>
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="index === orderedModules.length - 1 || busy"
                  @click="moveModule(index, 1)"
                >
                  ↓
                </button>
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="busy"
                  @click="checkUpdate(module.id)"
                >
                  {{ $t('gpnCheckUpdate') }}
                </button>
                <button
                  class="btn btn-ghost btn-xs text-error"
                  :disabled="busy"
                  @click="remove(module)"
                >
                  {{ $t('gpnUninstall') }}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3 pl-8 text-xs">
              <label class="flex items-center gap-1">
                <span class="opacity-70">{{ $t('gpnEgressGroup') }}</span>
                <select
                  class="select select-xs w-40"
                  :value="module.egress_group ?? ''"
                  :disabled="busy"
                  @change="setEgress(module, $event)"
                >
                  <option value="">{{ $t('gpnNoBinding') }}</option>
                  <option
                    v-for="group in proxyGroupList"
                    :key="group"
                    :value="group"
                  >
                    {{ group }}
                  </option>
                </select>
              </label>
              <label class="flex items-center gap-1">
                <span class="opacity-70">{{ $t('gpnCaptureDns') }}</span>
                <select
                  class="select select-xs w-28"
                  :value="module.capture_dns"
                  :disabled="busy"
                  @change="setCaptureDNS(module, $event)"
                >
                  <option value="trust">trust</option>
                  <option value="china">china</option>
                </select>
              </label>
              <span class="font-mono opacity-60">{{ module.capture_hosts.join(', ') }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GpnCandidate, GpnModuleSummary } from '@/api/gpn'
import {
  applyReviewedUpdate,
  catalogError,
  catalogSources,
  catalogStatus,
  checkExtensionUpdate,
  installReviewed,
  interception,
  interceptionError,
  interceptionStatus,
  refreshCatalog,
  refreshInterception,
  reviewCatalogEntry,
  reviewExtension,
  setExecutionOrder,
  setExtensionCaptureDNS,
  setExtensionEgress,
  setExtensionEnabled,
  setInterceptionSettings,
  uninstallExtension,
} from '@/assembly/gpn/interception'
import { proxyGroupList } from '@/assembly/proxies'
import { usePaddingForViews } from '@/composables/paddingViews'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

const data = computed(() => interception.value)
const busy = ref(false)
const notice = ref('')
const noticeIsError = ref(false)

const importUrl = ref('')
const importContent = ref('')
const candidate = ref<GpnCandidate | null>(null)
const updateTarget = ref('')
const reviewing = ref(false)
const reviewError = ref('')

const enabledCount = computed(() => data.value?.modules.filter((m) => m.enabled).length ?? 0)

const certificateGap = computed(
  () => data.value?.certificate.loaded === true && !data.value.certificate.covers_all_capture_hosts,
)

// 执行顺序是权威的;modules 数组只是集合。按顺序渲染,否则界面上的「第 1 个」
// 与真正先匹配的那个不是同一个扩展。
const orderedModules = computed(() => {
  const modules = data.value?.modules ?? []
  const order = data.value?.execution_order ?? []
  const byID = new Map(modules.map((m) => [m.id, m]))
  const out: GpnModuleSummary[] = []
  for (const id of order) {
    const module = byID.get(id)
    if (module) {
      out.push(module)
      byID.delete(id)
    }
  }
  return [...out, ...byID.values()]
})

const report = (error: string) => {
  noticeIsError.value = Boolean(error)
  notice.value = error === 'conflict' ? t('gpnConflict') : error || t('gpnSaved')
}

const run = async (action: () => Promise<string>) => {
  busy.value = true
  report(await action())
  busy.value = false
}

const settingsOf = () => ({
  enabled: data.value?.enabled ?? false,
  http2: data.value?.http2 ?? false,
  http3: data.value?.http3 ?? false,
})

const toggleMaster = () =>
  run(() => setInterceptionSettings({ ...settingsOf(), enabled: !data.value?.enabled }))
const toggleHttp2 = () =>
  run(() => setInterceptionSettings({ ...settingsOf(), http2: !data.value?.http2 }))
const toggleHttp3 = () =>
  run(() => setInterceptionSettings({ ...settingsOf(), http3: !data.value?.http3 }))

const toggleModule = (module: GpnModuleSummary) =>
  run(() => setExtensionEnabled(module.id, !module.enabled))

const setEgress = (module: GpnModuleSummary, event: Event) =>
  run(() => setExtensionEgress(module.id, (event.target as HTMLSelectElement).value))

const setCaptureDNS = (module: GpnModuleSummary, event: Event) =>
  run(() => setExtensionCaptureDNS(module.id, (event.target as HTMLSelectElement).value))

const moveModule = (index: number, delta: number) => {
  const order = orderedModules.value.map((m) => m.id)
  const target = index + delta
  if (target < 0 || target >= order.length) return
  const [id] = order.splice(index, 1)
  order.splice(target, 0, id)
  return run(() => setExecutionOrder(order))
}

const remove = (module: GpnModuleSummary) => {
  if (!window.confirm(t('gpnUninstallConfirm', { name: module.name || module.id }))) return
  return run(() => uninstallExtension(module.id))
}

const source = () =>
  importUrl.value.trim() ? { url: importUrl.value.trim() } : { content: importContent.value }

const review = async () => {
  reviewing.value = true
  reviewError.value = ''
  updateTarget.value = ''
  const result = await reviewExtension(source())
  candidate.value = result.candidate ?? null
  reviewError.value = result.error
  reviewing.value = false
}

const checkUpdate = async (id: string) => {
  reviewing.value = true
  reviewError.value = ''
  const result = await checkExtensionUpdate(id)
  candidate.value = result.candidate ?? null
  updateTarget.value = result.candidate ? id : ''
  reviewError.value = result.error
  reviewing.value = false
}

/**
 * 目录条目的审阅走同一个候选框。
 *
 * 服务端把 manifest URL 一并返回,这里把它填进导入框 —— 于是安装用的是审阅
 * 读过的那一个来源,而操作者在确认之前看得见它。从列表里拼回一个 URL 会让
 * 「审阅的东西」和「安装的东西」在理论上可以不是同一个。
 */
const reviewEntry = async (sourceId: string, entryId: string) => {
  reviewing.value = true
  reviewError.value = ''
  updateTarget.value = ''
  const result = await reviewCatalogEntry(sourceId, entryId)
  candidate.value = result.candidate ?? null
  reviewError.value = result.error
  if (result.url) {
    importUrl.value = result.url
    importContent.value = ''
  }
  reviewing.value = false
}

const install = async () => {
  const reviewed = candidate.value
  if (!reviewed) return
  const target = updateTarget.value
  await run(() =>
    target ? applyReviewedUpdate(target, reviewed) : installReviewed(reviewed, source()),
  )
  candidate.value = null
  updateTarget.value = ''
  importUrl.value = ''
  importContent.value = ''
  refreshCatalog()
}

refreshInterception()
refreshCatalog()
</script>
