import { http } from './http'

export const askQuestion = async (bookId, question) => {
  const res = await http.post(`/ask/${bookId}`, { question })
  return res.data
}
