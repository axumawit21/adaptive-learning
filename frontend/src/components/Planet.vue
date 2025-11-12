<template>
  <div
    :class="['absolute flex flex-col items-center justify-center cursor-pointer transition-transform duration-300', active ? 'scale-110 z-30' : '']"
    :style="style"
    @click="clickPlanet"
  >
    <div
      :class="['w-20 h-20 rounded-full shadow-[0_0_30px_rgba(56,189,248,0.6)] flex items-center justify-center text-center px-2 text-xs font-semibold text-white', gradientClass]"
      :style="planetStyle"
    >
      {{ subject.name }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  subject: { type: Object, required: true },
  x: Number,
  y: Number,
  active: Boolean
})

const emit = defineEmits(['select'])

const gradientClass = computed(() => 
  `bg-gradient-to-br ${props.subject.colorClass || 'from-cyan-400 to-blue-500'}`
)

const style = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
  position: 'absolute'
}))

function clickPlanet() {
  emit('select', props.subject)
}

const planetStyle = {
  filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.6))'
}
</script>

<style scoped>
div:hover > .rounded-full {
  transform: scale(1.1) rotate(5deg);
  filter: brightness(1.3);
}
</style>
