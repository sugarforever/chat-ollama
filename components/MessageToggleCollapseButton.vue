<script lang="ts" setup>
defineProps<{
  opened: boolean
}>()
</script>

<template>
  <button class="flex flex-col items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-[#666] dark:text-[#ccc]"
          :class="{ 'flex-col-reverse': !opened }">
    <Icon name="i-iconoir-nav-arrow-down" class="up block" />
    <Icon name="i-iconoir-nav-arrow-up" class="down block" />
  </button>
</template>

<style lang="scss" scoped>
$space: 3px;

button {

  svg {
    transition: all 0.3s;
    margin: 1px 0;
  }

  .up {
    transform: translateY(-$space);
  }

  .down {
    transform: translateY($space);
  }

  &:hover {
    .up {
      transform: translateY($space);
    }

    .down {
      transform: translateY(-$space);
    }
  }
}
</style>
