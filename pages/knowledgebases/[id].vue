<script setup>
const route = useRoute()
const id = route.params.id

const { data } = await useFetch(`/api/knowledgebases/${id}`)
const knowledgebase = ref(data.value.knowledgeBase)

const links = [{
  label: 'Knowledge Bases',
  icon: 'i-heroicons-book-open',
  to: '/knowledgebases'
}, {
  label: knowledgebase.value.name,
  icon: 'i-heroicons-square-3-stack-3d'
}]
</script>
<template>
  <div class="h-full flex flex-col w-full">
    <UBreadcrumb :links="links" class="px-4 mb-4 flex-shrink-0" />
    <ClientOnly>
      <chat :knowledgebase="knowledgebase" class="h-[calc(100%-32px-1rem)]" />
    </ClientOnly>
  </div>
</template>
