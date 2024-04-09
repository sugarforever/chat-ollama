<script setup lang="ts">
import { KnowledgeBase } from '@prisma/client'

const props = defineProps<{
  knowledgeBase: KnowledgeBase,
  onConfirm: () => void
}>()

const onSubmit = () => {
  props.onConfirm()
}

</script>

<template>
  <UModal>
    <div class="p-6 w-full">
      <h2 class="font-bold text-xl mb-4">Confirm</h2>
      <form class="space-y-4" @submit="onSubmit">
        <div>Are you sure deleting knowledge base <span class="font-bold">{{ knowledgeBase.name }}</span>?</div>

        <UButton type="submit">
          Yes
        </UButton>
      </form>
    </div>
  </UModal>
</template>
