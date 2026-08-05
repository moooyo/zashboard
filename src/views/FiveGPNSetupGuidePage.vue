<template>
  <div class="relative size-full overflow-x-hidden">
    <div
      class="flex flex-col gap-3 p-3"
      :style="padding"
    >
      <!-- This page tells a device the gateway's own address, so it does not ask the backend for a
           domain: the gateway already serves this page. console.<base> is in the browser address
           bar and dot.<base> follows from the same base. Manual entry would reintroduce exactly the
           error this guide is meant to eliminate. -->
      <div
        v-if="!derived"
        class="alert alert-warning"
      >
        <span>{{ $t('fivegpnGuideUnknownHost', { host: host }) }}</span>
      </div>

      <template v-else>
        <div class="base-container flex flex-col gap-3 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('fivegpnGuideDot') }}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <code class="bg-base-200/60 rounded-lg px-3 py-1.5 font-mono text-sm">{{
              derived.dot
            }}</code>
            <button
              class="btn btn-sm"
              @click="copy(derived.dot)"
            >
              {{ copied === derived.dot ? $t('fivegpnGuideCopied') : $t('fivegpnGuideCopy') }}
            </button>
          </div>
          <p class="text-base-content/60 max-w-2xl text-xs">{{ $t('fivegpnGuideDotHint') }}</p>
        </div>

        <div class="base-container flex flex-col gap-3 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('fivegpnGuideAndroid') }}
          </div>
          <ol class="text-base-content/80 ml-4 list-decimal space-y-1 text-sm">
            <li>{{ $t('fivegpnGuideAndroid1') }}</li>
            <li>
              {{ $t('fivegpnGuideAndroid2') }}
              <code class="bg-base-200/60 ml-1 rounded px-1.5 py-0.5 font-mono text-xs">{{
                derived.dot
              }}</code>
            </li>
            <li>{{ $t('fivegpnGuideAndroid3') }}</li>
          </ol>
          <p class="text-base-content/60 max-w-2xl text-xs">{{ $t('fivegpnGuideAndroidCa') }}</p>
        </div>

        <div class="base-container flex flex-col gap-3 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('fivegpnGuideIos') }}
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
                {{ $t('fivegpnGuideDownloadProfile') }}
              </a>
            </div>
            <ol class="text-base-content/80 ml-4 max-w-md list-decimal space-y-1 text-sm">
              <li>{{ $t('fivegpnGuideIos1') }}</li>
              <li>{{ $t('fivegpnGuideIos2') }}</li>
              <li>{{ $t('fivegpnGuideIos3') }}</li>
            </ol>
          </div>
        </div>

        <!-- Keep the interception CA separate from the DoT profile. Installing it enables
             decryption, which is a distinct decision to understand rather than the second half of
             the same setup step. -->
        <div class="base-container border-warning flex flex-col gap-3 border p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('fivegpnGuideCa') }}
          </div>
          <p class="text-base-content/80 max-w-2xl text-sm">{{ $t('fivegpnGuideCaWhat') }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <a
              class="btn btn-sm"
              :href="derived.caProfile"
              target="_blank"
              rel="noopener"
            >
              {{ $t('fivegpnGuideDownloadCa') }}
            </a>
            <span class="text-warning text-xs">{{ $t('fivegpnGuideCaTrust') }}</span>
          </div>
        </div>

        <div class="base-container flex flex-col gap-2 p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('fivegpnGuideVerify') }}
          </div>
          <div class="settings-grid">
            <div class="setting-item">
              <div class="setting-item-label">{{ $t('fivegpnGateway') }}</div>
              <span class="font-mono text-sm">{{ gateway || '—' }}</span>
            </div>
            <div class="setting-item">
              <div class="setting-item-label">{{ $t('fivegpnGuideDotPort') }}</div>
              <span class="font-mono text-sm">{{ dotListen || '—' }}</span>
            </div>
          </div>
          <p class="text-base-content/60 max-w-2xl text-xs">{{ $t('fivegpnGuideVerifyHint') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { dnsDocument, refreshDns } from '@/assembly/fivegpn/dns'
import QRCodeView from '@/components/tools/QRCodeView.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import { computed, ref } from 'vue'

const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

const host = window.location.hostname

/**
 * Derive the DoT name from the hostname serving this page.
 *
 * The installer places the panel at console.<base> and DoT at dot.<base>, sharing one base.
 * This page therefore does not need to ask the backend for a domain: the gateway serving it has
 * already put the answer in the address bar.
 *
 * When the hostname does not begin with console., do not guess. Explain the problem and point to
 * the authoritative location. A wrong guess would mislead at exactly the step this guide should
 * make reliable.
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
    // Clipboard access is unavailable in insecure contexts, and the address remains visible beside
    // the button. Manual copying is more useful than showing an error.
  }
}

refreshDns()
</script>
