<script setup>
const { t } = useI18n()
</script>
<template>
  <div class="text-lg mx-auto max-w-6xl">
    <h1 class="font-bold text-2xl my-8">{{ t("home.welcome") }}</h1>
    <p v-html="t('home.description')"></p>

    <h2 class="font-bold text-xl my-4">{{ t('home.quickStart') }}</h2>

    <ul class="list-decimal list-inside">
      <li v-html="t('home.step1')"></li>
      <li v-html="t('home.step2')"></li>
      <li v-html="t('home.step3')"></li>
    </ul>
  </div>
</template>
