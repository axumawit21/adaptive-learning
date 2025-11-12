<template>
  <!-- Units Panel -->
  <div class="absolute bottom-0 left-0 w-full bg-slate-900/70 backdrop-blur-sm py-4 px-6 overflow-x-auto flex gap-4">
    <div 
      v-for="unit in units" 
      :key="unit.id" 
      @click="selectUnit(unit)" 
      :class="['min-w-[180px] p-4 rounded-xl cursor-pointer flex-shrink-0 transition-all text-center', selectedUnit?.id === unit.id ? 'bg-cyan-500/80 scale-105' : 'bg-slate-800/60 hover:bg-slate-700']"
    >
      <div class="text-white font-semibold">{{ unit.title }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  subject: { type: Object, default: null } // subject object must include units: [{id, title}]
})
const emit = defineEmits(['unit-selected'])

const units = ref([])
const selectedUnit = ref(null)

// Update units when subject changes
watch(() => props.subject, (newSubject) => {
  selectedUnit.value = null
  units.value = newSubject?.units || []
})

function selectUnit(unit){
  selectedUnit.value = unit
  emit('unit-selected', { subject: props.subject, unit })
}
</script>

<style>
/* Optional: smooth horizontal scroll */
div[overflow-x-auto]::-webkit-scrollbar {
  height: 6px;
}
div[overflow-x-auto]::-webkit-scrollbar-thumb {
  background-color: rgba(255,255,255,0.2);
  border-radius: 3px;
}
</style>
