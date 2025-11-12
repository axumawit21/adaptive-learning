import { http } from './http'

export const summarizeChapter = async (bookId, chapter) => {
  const res = await http.post(`/summarize/${bookId}`, { chapter })
  return res.data
}
