import { http } from './http'

export const generateQuiz = async (body) => {
  const res = await http.post('/quiz/generate', body)
  return res.data
}
