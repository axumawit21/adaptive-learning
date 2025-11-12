<template>
  <header class="flex items-center justify-between px-6 py-3 bg-transparent sticky top-0 z-20">
    <div class="flex items-center gap-10">
      <!-- Grade Selector -->
      <select v-model="localGrade" @change="emitGrade" class="bg-slate-800 px-3 py-2 rounded text-sm">
        <option>Grade 9</option>
        <option>Grade 10</option>
        <option>Grade 11</option>
        <option>Grade 12</option>
      </select>

      <!-- Subject Dropdown -->
      <div class="flex flex-col relative">
        <div @click="toggleDropdown" class="text-white font-semibold cursor-pointer bg-slate-800/50 px-3 py-2 rounded flex items-center justify-between w-48">
          {{ selectedSubject ? selectedSubject.name : 'All Subjects' }}
          <span class="ml-2">▾</span>
        </div>

        <ul v-if="dropdownOpen" class="absolute top-full left-0 mt-1 w-48 bg-slate-800 rounded shadow-lg max-h-48 overflow-auto z-50">
          <li 
            v-for="(s,i) in subjects" 
            :key="i" 
            @click="selectSubject(s)" 
            class="px-3 py-2 hover:bg-slate-700 cursor-pointer text-white text-sm"
          >
            {{ s.name }}
          </li>
        </ul>
      </div>

      <!-- Mode Display -->
      <div v-if="mode" class="ml-4 text-sm font-semibold px-3 py-1 rounded bg-gradient-to-r from-cyan-500/20 to-violet-500/10 border border-cyan-400/20 text-cyan-200">
        {{ mode === 'summarize' ? 'Summarization Mode' : 'Quiz Mode' }}
      </div>
    </div>

    <!-- User Info -->
    <div class="flex items-center gap-3">
      <div class="text-slate-300 text-sm">Welcome, <span class="font-semibold text-white">Axumawit</span></div>
      <div class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">A</div>
    </div>
  </header>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  grade: { type: String, default: 'Grade 10' },
  subject: { type: Object, default: null },
  mode: { type: String, default: null },
  subjects: { type: Array, default: () => [] }
})

const emit = defineEmits(['change-grade','select-subject'])

const localGrade = ref(props.grade)
const selectedSubject = ref(props.subject)
const dropdownOpen = ref(false)

// Sync prop changes
watch(() => props.subject, (val) => selectedSubject.value = val)

function emitGrade() {
  emit('change-grade', localGrade.value)
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function selectSubject(subject) {
  selectedSubject.value = subject
  dropdownOpen.value = false
  emit('select-subject', subject)
}
</script>
