<script setup>
const { t } = useI18n()
const router = useRouter()

const goToSettings = () => {
  router.push('/settings')
}
</script>
<template>
  <div class="min-h-screen bg-white dark:bg-gray-900">
    <div class="flex items-center justify-center min-h-screen px-4 py-12">
      <div class="max-w-3xl w-full">
        <!-- Hero Section -->
        <div class="text-center mb-12">
          <h1 class="text-3xl md:text-4xl font-bold text-black dark:text-white mb-4">
            {{ t("home.welcome") }}
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-xl mx-auto">
            {{ t("home.subtitle") }}
          </p>
        </div>

        <!-- Main Content Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-700">
          <!-- Description -->
          <div class="text-center mb-10">
            <p class="text-base text-gray-700 dark:text-gray-300 leading-relaxed max-w-2xl mx-auto">
              {{ t("home.description") }}
            </p>
          </div>

          <!-- Features Grid -->
          <div class="mb-10">
            <h2 class="text-lg font-semibold text-center text-black dark:text-white mb-6">
              {{ t("home.whyChoose") }}
            </h2>
            <div class="grid md:grid-cols-3 gap-4">
              <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
                <div class="text-sm text-gray-800 dark:text-gray-200">
                  {{ t("home.feature1") }}
                </div>
              </div>
              <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
                <div class="text-sm text-gray-800 dark:text-gray-200">
                  {{ t("home.feature2") }}
                </div>
              </div>
              <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
                <div class="text-sm text-gray-800 dark:text-gray-200">
                  {{ t("home.feature3") }}
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Start Steps -->
          <div class="mb-8">
            <h2 class="text-lg font-semibold text-center text-black dark:text-white mb-6">
              {{ t("home.quickStart") }}
            </h2>
            <div class="grid md:grid-cols-2 gap-4 max-w-xl mx-auto">
              <div class="flex items-center p-4 bg-white dark:bg-gray-800 rounded-lg border border-primary">
                <div class="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3">1</div>
                <div v-html="t('home.step1')" class="text-sm text-gray-700 dark:text-gray-300"></div>
              </div>
              <div class="flex items-center p-4 bg-white dark:bg-gray-800 rounded-lg border border-primary">
                <div class="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3">2</div>
                <div v-html="t('home.step2')" class="text-sm text-gray-700 dark:text-gray-300"></div>
              </div>
            </div>
          </div>

          <!-- Call to Action -->
          <div class="text-center">
            <button @click="goToSettings"
                    class="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 font-semibold py-3 px-6 rounded-lg transition-colors">
              {{ t("home.getStarted") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
