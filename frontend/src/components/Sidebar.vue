<template>
  <aside class="w-64 h-screen p-4 flex flex-col justify-between bg-slate-900/30 backdrop-blur-sm">
    <div>
      <!-- Logo -->
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg"></div>
        <h1 class="text-white font-semibold">Henon</h1>
      </div>

      <!-- Progress view -->
      <button @click="$emit('progress-view')" class="w-full mb-2 flex items-center gap-2 py-2 px-3 bg-slate-800/60 text-white rounded-xl font-semibold hover:bg-slate-700">
        📊 <span>Progress View</span>
      </button>

      <!-- New Chat -->
      <button @click="$emit('new-chat')" class="w-full mb-2 flex items-center gap-2 py-2 px-3 bg-slate-800/60 text-white rounded-xl font-semibold hover:bg-slate-700">
        ➕ <span>New Chat</span>
      </button>

      <!-- Search History -->
      <button @click="$emit('search-history')" class="w-full mb-4 flex items-center gap-2 py-2 px-3 bg-slate-800/60 text-white rounded-xl font-semibold hover:bg-slate-700">
        🔍 <span>Search</span>
      </button>

      <!-- Divider -->
      <div class="border-t border-slate-700 my-4"></div>

      <!-- Chat History -->
      <div>
        <h3 class="flex items-center gap-2 text-slate-300 text-sm mb-2">
          🕘 <span>History</span>
        </h3>
        <ul class="space-y-2 max-h-64 overflow-auto pr-2">
          <li v-for="(h,i) in history" :key="i" class="flex items-center justify-between p-2 rounded-md hover:bg-slate-800 cursor-pointer">
            <div class="text-sm text-slate-200">{{ h.title }}</div>
            <div class="text-xs text-slate-400">{{ h.time }}</div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Footer Buttons -->
    <div class="text-slate-400 text-sm">
      <button class="w-full flex items-center gap-2 py-2 px-3 hover:bg-slate-800 rounded-xl">
        ⚙️ <span>Settings</span>
      </button>
      <button class="w-full flex items-center gap-2 py-2 px-3 hover:bg-slate-800 rounded-xl">
        🚪 <span>Logout</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
defineProps({ history: { type: Array, default: ()=>[] } })
</script>
