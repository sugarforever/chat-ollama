<script setup>
const { t } = useI18n()
const router = useRouter()

const goToSettings = () => {
  router.push('/settings')
}

const goToChat = () => {
  router.push('/chat')
}

const goToAgents = () => {
  router.push('/agents')
}
</script>

<template>
  <div class="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-950/20 overflow-auto">
    <div class="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12 sm:py-16 lg:py-20">

      <!-- Hero Section -->
      <section class="grid items-center gap-10 lg:grid-cols-[1.1fr,0.9fr]">
        <div class="space-y-6 animate-fade-in">
          <!-- Status pill -->
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg shadow-gray-200/30 dark:shadow-none">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-xs font-medium text-gray-600 dark:text-gray-400">{{ t("home.quickStart") }}</span>
          </div>

          <!-- Heading -->
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
            {{ t("home.welcome") }}
          </h1>

          <!-- Subtitle -->
          <p class="text-lg sm:text-xl text-gray-700 dark:text-gray-300 max-w-xl">
            {{ t("home.subtitle") }}
          </p>

          <!-- Description -->
          <p class="text-sm text-gray-500 dark:text-gray-400 max-w-xl leading-relaxed">
            {{ t("home.description") }}
          </p>

          <!-- CTA Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              @click="goToSettings"
              class="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02] transition-all duration-200 cursor-pointer"
            >
              <Icon name="i-heroicons-rocket-launch" class="w-5 h-5" />
              {{ t("home.getStarted") }}
            </button>
            <button
              @click="goToAgents"
              class="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 font-semibold hover:bg-white dark:hover:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 cursor-pointer"
            >
              <Icon name="i-heroicons-cpu-chip" class="w-5 h-5" />
              Try AI Agent
            </button>
          </div>
        </div>

        <!-- Quick Start Card -->
        <div class="relative p-6 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-xl shadow-gray-200/50 dark:shadow-none animate-fade-in-delay-1">
          <div class="absolute top-0 left-6 -translate-y-1/2">
            <span class="px-3 py-1 text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full">
              Quick Start
            </span>
          </div>

          <div class="flex items-center justify-between mb-6 mt-2">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ t("home.quickStart") }}
            </h2>
            <span class="px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full">
              01-02
            </span>
          </div>

          <div class="space-y-3">
            <!-- Step 1 -->
            <div class="group flex items-center gap-4 p-4 rounded-xl bg-gray-50/80 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600/50 hover:border-blue-200 dark:hover:border-blue-800 transition-colors cursor-pointer" @click="goToSettings">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
                1
              </div>
              <div class="flex-1 text-sm text-gray-700 dark:text-gray-200" v-html="t('home.step1')"></div>
              <Icon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </div>

            <!-- Step 2 -->
            <div class="group flex items-center gap-4 p-4 rounded-xl bg-gray-50/80 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600/50 hover:border-blue-200 dark:hover:border-blue-800 transition-colors cursor-pointer" @click="goToChat">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white font-semibold shadow-lg shadow-purple-500/25 group-hover:scale-110 transition-transform">
                2
              </div>
              <div class="flex-1 text-sm text-gray-700 dark:text-gray-200" v-html="t('home.step2')"></div>
              <Icon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </div>
      </section>

      <!-- Features Section -->
      <section class="grid gap-4 lg:grid-cols-3">
        <!-- Feature 1 -->
        <div class="group p-6 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-orange-500/5 animate-fade-in-delay-2">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icon name="i-heroicons-bolt" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <span class="text-xs font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase">01</span>
          </div>
          <p class="text-base font-semibold text-gray-900 dark:text-white">
            {{ t("home.feature1") }}
          </p>
          <div class="mt-4 h-1 w-12 rounded-full bg-gradient-to-r from-orange-400 to-orange-500"></div>
        </div>

        <!-- Feature 2 -->
        <div class="group p-6 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-blue-500/5 animate-fade-in-delay-3">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icon name="i-heroicons-shield-check" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span class="text-xs font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase">02</span>
          </div>
          <p class="text-base font-semibold text-gray-900 dark:text-white">
            {{ t("home.feature2") }}
          </p>
          <div class="mt-4 h-1 w-12 rounded-full bg-gradient-to-r from-blue-400 to-blue-500"></div>
        </div>

        <!-- Feature 3 -->
        <div class="group p-6 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/5 animate-fade-in-delay-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icon name="i-heroicons-sparkles" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span class="text-xs font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase">03</span>
          </div>
          <p class="text-base font-semibold text-gray-900 dark:text-white">
            {{ t("home.feature3") }}
          </p>
          <div class="mt-4 h-1 w-12 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"></div>
        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.6s ease-out both;
}

.animate-fade-in-delay-1 {
  animation: fadeIn 0.6s ease-out 0.1s both;
}

.animate-fade-in-delay-2 {
  animation: fadeIn 0.6s ease-out 0.2s both;
}

.animate-fade-in-delay-3 {
  animation: fadeIn 0.6s ease-out 0.3s both;
}

.animate-fade-in-delay-4 {
  animation: fadeIn 0.6s ease-out 0.4s both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in,
  .animate-fade-in-delay-1,
  .animate-fade-in-delay-2,
  .animate-fade-in-delay-3,
  .animate-fade-in-delay-4 {
    animation: none;
  }
}
</style>
