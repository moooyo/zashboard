<template>
  <div class="relative size-full overflow-x-hidden">
    <div
      class="flex flex-col gap-3 p-3"
      :style="padding"
    >
      <!-- 这一页把网关自己的地址讲给设备听,所以它不问后端要域名 —— 它就是被那台
           网关服务的。console.<base> 是浏览器地址栏里的东西,dot.<base> 由同一个
           base 推出。一份需要人手填写的向导,填错的正是它本该消除的那个环节。 -->
      <div
        v-if="!derived"
        class="alert alert-warning"
      >
        <span>{{ $t('gpnGuideUnknownHost', { host: host }) }}</span>
      </div>

      <template v-else>
        <div class="base-container flex flex-col gap-3 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('gpnGuideDot') }}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <code class="bg-base-200/60 rounded-lg px-3 py-1.5 font-mono text-sm">{{
              derived.dot
            }}</code>
            <button
              class="btn btn-sm"
              @click="copy(derived.dot)"
            >
              {{ copied === derived.dot ? $t('gpnGuideCopied') : $t('gpnGuideCopy') }}
            </button>
          </div>
          <p class="text-base-content/60 max-w-2xl text-xs">{{ $t('gpnGuideDotHint') }}</p>
        </div>

        <div class="base-container flex flex-col gap-3 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('gpnGuideAndroid') }}
          </div>
          <ol class="text-base-content/80 ml-4 list-decimal space-y-1 text-sm">
            <li>{{ $t('gpnGuideAndroid1') }}</li>
            <li>
              {{ $t('gpnGuideAndroid2') }}
              <code class="bg-base-200/60 ml-1 rounded px-1.5 py-0.5 font-mono text-xs">{{
                derived.dot
              }}</code>
            </li>
            <li>{{ $t('gpnGuideAndroid3') }}</li>
          </ol>
          <p class="text-base-content/60 max-w-2xl text-xs">{{ $t('gpnGuideAndroidCa') }}</p>
        </div>

        <div class="base-container flex flex-col gap-3 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('gpnGuideIos') }}
          </div>
          <div class="flex flex-wrap items-start gap-6">
            <div class="flex flex-col items-center gap-2">
              <QRCodeView :value="derived.dotProfile" />
              <a
                class="btn btn-sm btn-primary"
                :href="derived.dotProfile"
                target="_blank"
                rel="noopener"
              >
                {{ $t('gpnGuideDownloadProfile') }}
              </a>
            </div>
            <ol class="text-base-content/80 ml-4 max-w-md list-decimal space-y-1 text-sm">
              <li>{{ $t('gpnGuideIos1') }}</li>
              <li>{{ $t('gpnGuideIos2') }}</li>
              <li>{{ $t('gpnGuideIos3') }}</li>
            </ol>
          </div>
        </div>

        <!-- 拦截 CA 单独一块,而且不和 DoT 描述文件并列:装了它才会被解密,那是一个
             需要单独理解的决定,不是同一步骤的下半截。 -->
        <div class="base-container border-warning flex flex-col gap-3 border p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('gpnGuideCa') }}
          </div>
          <p class="text-base-content/80 max-w-2xl text-sm">{{ $t('gpnGuideCaWhat') }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <a
              class="btn btn-sm"
              :href="derived.caProfile"
              target="_blank"
              rel="noopener"
            >
              {{ $t('gpnGuideDownloadCa') }}
            </a>
            <span class="text-warning text-xs">{{ $t('gpnGuideCaTrust') }}</span>
          </div>
        </div>

        <div class="base-container flex flex-col gap-2 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('gpnGuideVerify') }}
          </div>
          <div class="settings-grid">
            <div class="setting-item">
              <div class="setting-item-label">{{ $t('gpnGateway') }}</div>
              <span class="font-mono text-sm">{{ gateway || '—' }}</span>
            </div>
            <div class="setting-item">
              <div class="setting-item-label">{{ $t('gpnGuideDotPort') }}</div>
              <span class="font-mono text-sm">{{ dotListen || '—' }}</span>
            </div>
          </div>
          <p class="text-base-content/60 max-w-2xl text-xs">{{ $t('gpnGuideVerifyHint') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { dnsDocument, refreshDns } from '@/assembly/gpn/dns'
import QRCodeView from '@/components/tools/QRCodeView.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import { computed, ref } from 'vue'

const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

const host = window.location.hostname

/**
 * 从服务这一页的主机名推出 DoT 名字。
 *
 * 安装器把面板放在 console.<base>,DoT 放在 dot.<base>,两者共用一个 base。所以
 * 这一页不需要问后端要域名 —— 它就是被那台网关服务的,地址栏里已经写着答案。
 *
 * 主机名不是 console. 开头时不猜:直接说明,并把该看的地方指出来。一份猜错了的
 * 向导,恰恰会在它本该消除的那个环节上骗人。
 */
const derived = computed(() => {
  if (!host.startsWith('console.')) return null
  const base = host.slice('console.'.length)
  if (!base.includes('.')) return null
  const origin = window.location.origin
  return {
    base,
    dot: `dot.${base}`,
    dotProfile: `${origin}/ui/ios-dot.mobileconfig`,
    caProfile: `${origin}/ui/ios-intercept-ca.mobileconfig`,
  }
})

const gateway = computed(() => dnsDocument.value?.gateway ?? '')
const dotListen = computed(() => dnsDocument.value?.listen.dot ?? '')

const copied = ref('')
const copy = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    setTimeout(() => {
      if (copied.value === value) copied.value = ''
    }, 1500)
  } catch {
    // 剪贴板在非安全上下文里不可用,而地址就在旁边显示着 —— 抄一次比弹一个
    // 错误有用。
  }
}

refreshDns()
</script>
