<template>
  <div class="text-lg mx-auto max-w-6xl">
    <h1 class="font-bold text-2xl my-8">Welcome to ChatOllama</h1>

    <p>ChatOllama is a web application that allows you to manage your <a class="text-primary font-bold"
         href="https://ollama.ai"
         target="_blank">Ollama</a> server and chat with
      the served LLMs from anywhere in the world.</p>

    <h2 class="font-bold text-xl my-4">Quick Start</h2>

    <ul class="list-decimal list-inside">
      <li>Make sure your Ollama server is publicly accessible. If required, you can use <a class="text-primary"
           href="https://ngrok.com/"
           target="_blank">ngrok</a> to
        expose your Ollama server in your local machine to the public.</li>
      <li>Go to <a class="text-primary" href="/settings">Settings</a> to set the host of your Ollama server.</li>
      <li>
        Start enjoying the excellence of Ollama.
        <ul class="list-disc list-inside ml-4">
          <li>Models management(list/download/delete) - <a class="text-primary" href="/models">Link</a></li>
          <li>Chat with the models - <a class="text-primary" href="/chat">Link</a></li>
        </ul>
      </li>
    </ul>
  </div>
</template>
