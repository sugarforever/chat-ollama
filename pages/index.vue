<script setup>
import {useI18n} from "vue-i18n";
const { t } = useI18n()
</script>
<template>
  <div class="text-lg mx-auto max-w-6xl">
    <h1 class="font-bold text-2xl my-8">{{ t("Home.Welcome") }}</h1>

    <p>{{ t("Home.ChatOllama is a web application that allows you to manage your") }} <a class="text-primary font-bold"
         href="https://ollama.ai"
         target="_blank">Ollama</a> {{ t("Home.server and chat with the served LLMs from anywhere in the world") }}</p>

    <h2 class="font-bold text-xl my-4">{{ t("Home.Quick Start") }}</h2>

    <ul class="list-decimal list-inside">
      <li>{{ t("Home.Make sure your Ollama server is publicly accessible.If required, you can use") }} <a class="text-primary"
           href="https://ngrok.com/"
           target="_blank">ngrok</a> {{ t("Home.to expose your Ollama server in your local machine to the public") }}</li>
      <li>{{ t("Home.Go to") }} <a class="text-primary" href="/settings">{{ t("menu.settings") }}</a> {{ t("Home.to set the host of your Ollama server") }}</li>
      <li>
        {{ t("Home.Start enjoying the excellence of Ollama") }}
        <ul class="list-disc list-inside ml-4">
          <li>{{ t("Home.Models management(list / download / delete)") }} - <a class="text-primary" href="/models">{{ t("Home.Link") }}</a></li>
          <li>{{ t("Home.Chat with the models") }} - <a class="text-primary" href="/chat">{{ t("Home.Link") }}</a></li>
        </ul>
      </li>
    </ul>
  </div>
</template>
