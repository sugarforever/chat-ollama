<script lang="ts" setup>
import { keysStore } from '~/utils/settings'

const enabled = computed({
  get() {
    return keysStore.value.proxyEnabled || false
  },
  set(val) {
    keysStore.value = Object.assign(keysStore.value, { proxyEnabled: val })
  }
})

const url = computed({
  get() {
    return keysStore.value.proxyUrl || ''
  },
  set(val) {
    keysStore.value = Object.assign(keysStore.value, { proxyUrl: val })
  }
})
</script>

<template>
  <ClientOnly>
    <SettingsCard title="Proxy Settings" subtitle="<span style='color:red;font-style:italic;'>(experimental)</span>">
      <UFormGroup label="Proxy URL" class="mb-4">
        <template #label>
          <div class="flex items-center">
            <span>Proxy URL</span>
            <UPopover mode="hover" :popper="{ placement: 'top' }">
              <UButton icon="i-heroicons-information-circle-20-solid" variant="ghost" class="ml-1"></UButton>
              <template #panel>
                <div class="p-4 text-sm">
                  <div>Only <i>HTTP / HTTPS / SOCKS4 / SOCKS5</i> protocols are supported.</div>
                  <div class="mt-4 mb-2">i.e.</div>
                  <ul class="list-inside list-disc">
                    <li>http://127.0.0.1:1080</li>
                    <li>socks5://127.0.0.1:1080</li>
                    <li>http://username:password@127.0.0.1:1080</li>
                    <li>socks5://username:password@127.0.0.1:1080</li>
                  </ul>
                </div>
              </template>
            </UPopover>
          </div>
        </template>
        <UInput v-model="url" size="lg" />
      </UFormGroup>
      <UFormGroup label="Proxy Enabled" class="mb-4">
        <UCheckbox v-model="enabled" />
      </UFormGroup>
    </SettingsCard>
  </ClientOnly>
</template>
