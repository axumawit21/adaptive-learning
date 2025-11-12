<template>
  <div class="relative w-full h-full flex items-center justify-center overflow-hidden bg-transparent">

    <!-- Lumi AI orb -->
    <div
      class="absolute flex flex-col items-center justify-center z-20 text-center cursor-pointer"
      @click="handleLumiClick"
    >
      <div
        class="w-36 h-36 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 shadow-[0_0_80px_rgba(139,92,246,0.6)] flex flex-col items-center justify-center relative animate-pulse"
      >
        <!-- Eyes -->
        <div class="flex justify-center gap-6 mb-2">
          <div class="w-3 h-3 bg-white rounded-full shadow-md"></div>
          <div class="w-3 h-3 bg-white rounded-full shadow-md"></div>
        </div>
        <!-- Smile -->
        <div class="w-10 h-3 border-b-4 border-white/80 rounded-b-full"></div>
      </div>
      <div
        class="mt-4 text-sm bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-700/50 text-slate-200 shadow-lg max-w-xs"
      >
        Hello 👋, with what subject do you want me to help you today?
      </div>
    </div>

    <!-- Orbit rings and planets -->
    <transition-group
      name="fade-scale"
      tag="div"
      class="absolute inset-0"
    >
      <div
        v-for="(orbit, index) in orbits"
        :key="'orbit-' + index"
        class="absolute rounded-full border border-slate-600/30"
        :style="{
          width: orbit.size + 'px',
          height: orbit.size + 'px',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }"
        v-if="!inAIChat"
      ></div>

      <Planet
        v-for="(planet, i) in planets"
        :key="planet.id"
        v-if="!inAIChat"
        :subject="planet"
        :style="planetStyle(i)"
        @select="handlePlanetClick"
      />
    </transition-group>
  </div>
</template>

<script setup>
import Planet from './Planet.vue'
import { mockBookStructure } from '../data/mock-book-structure.js'

const emit = defineEmits(['planet-clicked','lumi-clicked'])
defineProps({ inAIChat: { type: Boolean } })

/**
 * Planets (subjects)
 */
const planets = [
  { id: 'bio', name: 'Biology', colorClass: 'from-green-400 to-emerald-500' },
  { id: 'math', name: 'Math', colorClass: 'from-cyan-400 to-blue-500' },
  { id: 'eng', name: 'English', colorClass: 'from-pink-400 to-fuchsia-500' },
  { id: 'phy', name: 'Physics', colorClass: 'from-yellow-400 to-orange-500' },
  { id: 'chem', name: 'Chemistry', colorClass: 'from-purple-400 to-violet-500' },
  { id: 'geo', name: 'Geography', colorClass: 'from-teal-400 to-green-400' },
]

/**
 * Orbit definitions — wider spacing for a clean circle layout
 */
const orbits = [
  { size: 500, speed: 70 }, // inner orbit
  { size: 650, speed: 95 }  // outer orbit
]

function planetStyle(index) {
  const orbitIndex = index % orbits.length
  const orbitRadius = orbits[orbitIndex].size / 2
  const angle = (index / planets.length) * (2 * Math.PI)
  const x = Math.cos(angle) * orbitRadius
  const y = Math.sin(angle) * orbitRadius

  return {
    position: 'absolute',
    left: `calc(50% + ${x}px - 40px)`,
    top: `calc(50% + ${y}px - 40px)`,
    width: '80px',
    height: '80px',
    animation: `orbit-${orbitIndex} ${orbits[orbitIndex].speed}s linear infinite`
  }
}

function handlePlanetClick(planet) {
  // find the full subject object
  const fullSubject = mockBookStructure.subjects.find(s => s.id === planet.id)
  if (!fullSubject) return
  emit('planet-clicked', fullSubject)
}

function handleLumiClick() {
  emit('lumi-clicked')
}
</script>

<style scoped>
@keyframes spin-slow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.animate-spin-slow {
  animation: spin-slow linear infinite;
}

/* Orbiting motion for planets */
@keyframes orbit-0 {
  0% { transform: rotate(0deg) translateX(260px) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(260px) rotate(-360deg); }
}

@keyframes orbit-1 {
  0% { transform: rotate(0deg) translateX(350px) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(350px) rotate(-360deg); }
}

.fade-scale-enter-active, .fade-scale-leave-active {
  transition: all 0.5s ease;
}
.fade-scale-enter-from, .fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
.fade-scale-enter-to, .fade-scale-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
