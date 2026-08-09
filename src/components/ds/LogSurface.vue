<template>
  <section class="flex size-full min-h-0 flex-col overflow-hidden">
    <header class="border-base-300 bg-base-100 shrink-0 border-b">
      <slot name="controls" />
    </header>
    <div class="min-h-0 flex-1">
      <slot />
    </div>
  </section>
</template>
