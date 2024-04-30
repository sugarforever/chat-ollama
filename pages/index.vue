<script setup>
import {useI18n} from "vue-i18n";
const { t } = useI18n()
</script>
<template>
  <div class="text-lg mx-auto max-w-6xl">
    <h1 class="font-bold text-2xl my-8">{{ t("Welcome to ChatOllama") }}</h1>

    <p>{{ t("ChatOllama is a web application that allows you to manage your") }} <a class="text-primary font-bold"
         href="https://ollama.ai"
         target="_blank">Ollama</a> {{ t("server and chat with the served LLMs from anywhere in the world.") }}</p>

    <h2 class="font-bold text-xl my-4">{{ t("Quick Start") }}</h2>

    <ul class="list-decimal list-inside">
      <li>{{ t("Make sure your Ollama server is publicly accessible.If required, you can use") }} <a class="text-primary"
           href="https://ngrok.com/"
           target="_blank">ngrok</a> {{ t("to expose your Ollama server in your local machine to the public.") }}</li>
      <li>{{ t("Go to") }} <a class="text-primary" href="/settings">{{ t("Settings") }}</a> {{ t("to set the host of your Ollama server.") }}</li>
      <li>
        {{ t("Start enjoying the excellence of Ollama.") }}
        <ul class="list-disc list-inside ml-4">
          <li>{{ t("Models management(list / download / delete)") }} - <a class="text-primary" href="/models">{{ t("Link") }}</a></li>
          <li>{{ t("Chat with the models") }} - <a class="text-primary" href="/chat">{{ t("Link") }}</a></li>
        </ul>
      </li>
    </ul>
  </div>
</template>
