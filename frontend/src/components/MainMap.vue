<template>
  <div class="w-full h-full relative">
    <div :style="currentBgStyle" class="absolute inset-0 transition-opacity duration-500 pointer-events-none"></div>

    <div class="relative w-full h-full flex items-center justify-center">
      <div class="relative" :style="{ width: mapW+'px', height: mapH+'px' }">

        <template v-if="!props.inAIChat">
          <Planet
            v-for="(s,i) in visibleSubjects"
            :key="s.id"
            :subject="s"
            :x="positions[i]?.x || 0"
            :y="positions[i]?.y || 0"
            :active="selected && selected.id===s.id"
            @select="onSelectSubject"
          />
        </template>

        <transition-group name="unit" tag="div">
          <div
            v-if="inUnitView && !props.inAIChat"
            v-for="(u, idx) in orbitUnits"
            :key="u.id"
            :style="unitStyle(idx)"
            class="absolute flex flex-col items-center gap-2"
          >
            <div @click="selectUnit(u)" class="bg-slate-800/80 px-4 py-2 rounded-xl cursor-pointer shadow-md">
              <div class="font-semibold text-sm text-white">{{ u.title }}</div>
            </div>
          </div>
        </transition-group>

        <transition-group name="unit" tag="div">
          <div
            v-if="inSubtitleView && !props.inAIChat"
            v-for="(sub, idx) in orbitSubtitles"
            :key="sub.id"
            :style="unitStyle(idx)"
            class="absolute"
          >
            <div @click="selectSubtitle(sub)" class="bg-slate-800/80 px-4 py-2 rounded-xl cursor-pointer shadow-md text-sm">
              {{ sub.title }}
            </div>
          </div>
        </transition-group>

        <div v-if="inChat && !props.inAIChat" class="absolute inset-0 flex items-end justify-center p-10">
          <div class="w-full max-w-3xl h-full bg-slate-900/70 rounded-xl p-6 overflow-auto">
            <div class="flex items-center justify-between mb-4">
              <div>
                <div class="text-sm text-slate-300">Chatting in</div>
                <div class="font-semibold text-white">{{ selected?.name }} · {{ activeUnit?.title }} · {{ activeSubtitle?.title }}</div>
              </div>
            </div>

            <div class="flex-1 bg-transparent text-slate-200">
              <p class="text-slate-400">Lumi: Ready to answer questions about this subtitle. Use the composer below.</p>
            </div>
          </div>
        </div>

        <div v-if="props.inAIChat" class="absolute inset-0 flex items-center justify-center pointer-events-none"></div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import Planet from './Planet.vue'

const props = defineProps({
  bookId: String,
  subjects: { type: Array, default: ()=>[] },
  selectedSubject: Object,
  activeMode: String,
  inAIChat: { type: Boolean, default: false }
})
const emit = defineEmits(['subject-selected','unit-selected','subtitle-selected'])

const mapW = 900, mapH = 520
const centerX = mapW/2, centerY = mapH/2
const radius = 180

const allSubjects = ref(props.subjects || [])
const visibleSubjects = ref(allSubjects.value.slice(0,6))
const positions = ref([])

const selected = ref(null)
const inUnitView = ref(false)
const inSubtitleView = ref(false)
const inChat = ref(false)
const orbitUnits = ref([])
const orbitSubtitles = ref([])
const activeUnit = ref(null)
const activeSubtitle = ref(null)

function computePositions(){
  const n = visibleSubjects.value.length || 1
  positions.value = visibleSubjects.value.map((s,i)=>{
    const angle = (i / n) * Math.PI * 2 - Math.PI/2
    const x = centerX + radius * Math.cos(angle) - 40
    const y = centerY + radius * Math.sin(angle) - 40
    return {x,y,angle}
  })
}

onMounted(()=> computePositions())
watch(()=>visibleSubjects.value, ()=> computePositions())
watch(()=>props.subjects, (v)=>{ allSubjects.value = v || []; visibleSubjects.value = allSubjects.value.slice(0,6); computePositions() })

watch(() => props.inAIChat, (val) => {
  if(val){
    selected.value = null
    visibleSubjects.value = []
    inUnitView.value = false
    inSubtitleView.value = false
    inChat.value = false
    orbitUnits.value = []
    orbitSubtitles.value = []
    activeUnit.value = null
    activeSubtitle.value = null
  } else {
    visibleSubjects.value = allSubjects.value.slice(0,6)
    computePositions()
  }
})

function onSelectSubject(s){
  selected.value = s
  emit('subject-selected', s)
  visibleSubjects.value = [s]
  inUnitView.value = true
  inSubtitleView.value = false
  inChat.value = false
  orbitUnits.value = s.units || []

  if (s && s.bg) {
    document.documentElement.style.setProperty('--app-bg', `linear-gradient(180deg, rgba(11,18,32,0.85), rgba(36,16,59,0.85)), url(${s.bg})`)
  }
}

function unitStyle(idx){
  const n = (inUnitView.value ? orbitUnits.value.length : orbitSubtitles.value.length) || 1
  const r = 110
  const angle = (idx / n) * Math.PI * 2 - Math.PI/2
  const x = centerX + r * Math.cos(angle) - 60
  const y = centerY + r * Math.sin(angle) - 20
  return { left: `${x}px`, top: `${y}px`, position: 'absolute' }
}

function selectUnit(u){
  activeUnit.value = u
  inSubtitleView.value = true
  orbitSubtitles.value = u.subtitles || []
  inUnitView.value = false
  emit('unit-selected', { subject: selected.value, unit: u })
}

function selectSubtitle(sub){
  activeSubtitle.value = sub
  inSubtitleView.value = false
  orbitUnits.value = []
  inChat.value = true
  emit('subtitle-selected', { subject: selected.value, unit: activeUnit.value, subtitle: sub })
}

const currentBgStyle = computed(()=> {
  if(!selected.value) return { background: 'transparent', opacity: 0 }
  return {
    backgroundImage: `linear-gradient(180deg, rgba(11,18,32,0.85), rgba(36,16,59,0.85)), url(${selected.value.bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: 1,
    zIndex: 0,
    filter: 'brightness(0.5) saturate(0.9)'
  }
})
</script>

<style scoped>
.unit-enter-from, .unit-leave-to { opacity: 0; transform: scale(.95) }
.unit-enter-active, .unit-leave-active { transition: all .35s cubic-bezier(.2,.9,.2,1) }
</style>
