<script lang="ts">
  export let name = "chat";
  export let size = 18;
  const paths: Record<string, string> = {
    chat: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
    plus: "M12 5v14M5 12h14",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    close: "M6 6l12 12M6 18 18 6",
    send: "m22 2-7 20-4-9-9-4L22 2ZM11 13 22 2",
    lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5V11ZM12 15v2",
    book: "M12 5v16M3 3h4a5 5 0 0 1 5 2 5 5 0 0 1 5-2h4v16h-4a5 5 0 0 0-5 2 5 5 0 0 0-5-2H3V3Z",
    tools: "m14 6 4 4M3 21l6-6M9 15l-3-3 9-9h6v6l-9 9-3-3Z",
    chevron: "m9 5 7 7-7 7",
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name] ?? paths.chat} /></svg
>

<style>
  svg {
    flex-shrink: 0;
    vertical-align: middle;
  }
</style>
