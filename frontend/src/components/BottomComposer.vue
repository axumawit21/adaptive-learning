<template>
  <footer class="sticky bottom-0 bg-gradient-to-t from-transparent to-slate-900/60 p-4">
    <div class="max-w-6xl mx-auto flex flex-col gap-3">
      <div class="flex items-start gap-3">
        <textarea v-model="text" rows="1" @keydown.enter.exact.prevent="send" class="flex-1 resize-none rounded-xl bg-slate-800 p-3 text-white placeholder-slate-400" :placeholder="placeholder"></textarea>
        <button @click="send" class="w-12 h-12 rounded-xl bg-cyan-500 flex items-center justify-center">⬆️</button>
      </div>

      <div class="flex gap-3 overflow-x-auto pb-2">
        <div v-for="f in features" :key="f.id" @click="toggleFeature(f.id)" :class="featureClass(f.id)" class="min-w-[140px] p-3 rounded-2xl cursor-pointer shadow-md">
          <div class="text-sm font-semibold">{{ f.label }}</div>
          <div class="text-xs text-slate-300 mt-1">{{ f.desc }}</div>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ref, computed } from 'vue'
const emit = defineEmits(['send','set-mode'])
const props = defineProps({
  activeMode: { type: String, default: null },
  selectedSubject: Object,
  activeUnit: Object,
  activeSubtitle: Object
})
const text = ref('')
const features = [
  { id: 'summarize', label: 'Summarize', desc: 'Short summary of selected content' },
  { id: 'quiz', label: 'Quiz', desc: 'Generate practice questions' }
]

function toggleFeature(id){
  const next = props.activeMode === id ? null : id
  emit('set-mode', next)
}
function send(){
  if(!text.value.trim()) return
  emit('send', {
    text: text.value,
    mode: props.activeMode,
    subject: props.selectedSubject,
    unit: props.activeUnit,
    subtitle: props.activeSubtitle
  })
  text.value = ''
}

function featureClass(id){
  return [
    props.activeMode === id ? 'bg-gradient-to-r from-cyan-400/20 to-violet-400/20 ring-2 ring-cyan-400 scale-105' : 'bg-slate-800'
  ].join(' ')
}
const placeholder = computed(()=> props.activeMode ? (props.activeMode==='summarize' ? 'Select text / chapter to summarize or type your request...' : 'Type to generate a quiz on current topic...') : 'Ask Lumi anything about this chapter...')
</script>
