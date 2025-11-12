<template>
  <div class="flex flex-col items-center">
    <div class="w-28 h-28 rounded-full bg-gradient-to-br from-purple-400 to-cyan-400 shadow-2xl animate-pulse"></div>
    <div class="mt-3 max-w-xs text-center bg-slate-900/60 px-4 py-2 rounded-lg">
      <div class="text-sm">Welcome, <span class="font-semibold">Axumawit</span></div>
      <div class="text-xs text-slate-300 mt-1">What subject would you like me to help you with today?</div>
      <div class="mt-3 flex gap-2 justify-center">
        <button v-for="s in chips" :key="s.id" @click="$emit('chip', s)" class="px-3 py-1 rounded-full bg-slate-800 text-sm">{{ s.name }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({ chips: { type: Array, default: ()=>[] } })
</script>
