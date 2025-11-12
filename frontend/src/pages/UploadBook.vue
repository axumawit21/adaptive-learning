<template>
  <div class="p-6 max-w-md mx-auto">
    <h1 class="text-2xl font-bold mb-4 text-blue-600">Upload a Book (PDF)</h1>
    <form @submit.prevent="uploadPDF" class="space-y-4">
      <input
        type="file"
        accept="application/pdf"
        @change="handleFile"
        class="w-full border p-2 rounded"
      />
      <button
        type="submit"
        class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Upload PDF
      </button>
    </form>

    <p v-if="message" class="mt-4 text-green-600">{{ message }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import api from '../services/api'

const selectedFile = ref(null)
const message = ref('')

function handleFile(e) {
  selectedFile.value = e.target.files[0]
}

async function uploadPDF() {
  if (!selectedFile.value) {
    message.value = 'Please select a PDF file.'
    return
  }

  const formData = new FormData()
  formData.append('file', selectedFile.value)

  try {
    const res = await api.post('/books/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    message.value = res.data.message
  } catch (error) {
    message.value = 'Upload failed.'
    console.error(error)
  }
}
</script>