<template>
  <div class="min-h-screen">
    <div class="flex">
      <Sidebar :history="history" @new-chat="handleNewChat" />
      <div class="flex-1 flex flex-col min-h-screen">
        <Topbar 
          :grade="grade" 
          :subject="selectedSubject" 
          :mode="activeMode" 
          :subjects="subjects"
          @change-grade="onGradeChange" 
          @select-subject="onSelectSubject"
        />
        <main class="flex-1 relative overflow-hidden">
          <MainMap
            :bookId="bookId"
            :subjects="subjects"
            :selectedSubject="selectedSubject"
            :activeMode="activeMode"
            :inAIChat="inAIChat"
            @subject-selected="onSubjectSelected"
            @unit-selected="onUnitSelected"
            @subtitle-selected="onSubtitleSelected"
          />
        </main>

        <!-- Universe Orbit: hidden in AI chat -->
        <transition name="fade">
          <UniverseOrbit 
            v-if="!inAIChat"
            :inAIChat="inAIChat"
            @planet-clicked="onSubjectSelected"
            @lumi-clicked="onLumiClicked"
          />
        </transition>

        <!-- Sliding Cosmic Panel for units -->
        <SlidingCosmicPanel 
          v-if="selectedSubject && !inAIChat" 
          :subject="selectedSubject" 
          @unit-selected="onUnitSelected"
        />

        <!-- Bottom Composer (chat input + Summarize/Quiz features) -->
        <BottomComposer
          v-if="inAIChat || inChat"
          :active-mode="activeMode"
          :selectedSubject="inAIChat ? { name: 'Lumi AI' } : selectedSubject"
          :activeUnit="activeUnit"
          :activeSubtitle="activeSubtitle"
          @send="handleSend"
          @set-mode="mode => activeMode = mode"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import MainMap from './MainMap.vue'
import BottomComposer from './BottomComposer.vue'
import SlidingCosmicPanel from './SlidingCosmicPanel.vue'
import UniverseOrbit from './UniverseOrbit.vue'
import { mockBookStructure } from '../data/mock-book-structure.js'

const history = ref([])
const grade = ref('Grade 10')
const bookId = ref(mockBookStructure.bookId)
const subjects = ref(mockBookStructure.subjects)

const selectedSubject = ref(null)
const activeUnit = ref(null)
const activeSubtitle = ref(null)
let activeMode = ref(null)
const inChat = ref(false)
const inAIChat = ref(false)

function handleNewChat() {
  selectedSubject.value = null
  activeUnit.value = null
  activeSubtitle.value = null
  activeMode.value = null
  inChat.value = false
  inAIChat.value = false
}

function onGradeChange(g){ grade.value = g }

function onSelectSubject(subject){
  selectedSubject.value = subject
}

function onSubjectSelected(subject) {
  selectedSubject.value = subject
  activeUnit.value = null
  activeSubtitle.value = null
  inChat.value = false
  inAIChat.value = false
}

function onUnitSelected(payload) {
  activeUnit.value = payload.unit
  selectedSubject.value = payload.subject
  inChat.value = true
  inAIChat.value = false
}

function onSubtitleSelected(payload) {
  activeSubtitle.value = payload.subtitle
  activeUnit.value = payload.unit
  selectedSubject.value = payload.subject
  inChat.value = true
  inAIChat.value = false
}

function onLumiClicked() {
  inAIChat.value = true
  inChat.value = false
  selectedSubject.value = null
  activeUnit.value = null
  activeSubtitle.value = null
}

function handleSend(payload){
  console.log('send to backend:', payload)
}
</script>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
