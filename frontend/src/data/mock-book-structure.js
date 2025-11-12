export const MOCK_BOOK_ID = 'bio_grade_9'

export const mockBookStructure = {
  bookId: MOCK_BOOK_ID,
  subjects: [
    {
      id: 'bio',
      name: 'Biology',
      bg: '/src/assets/subjects/biology-bg.jpg',
      colorClass: 'from-emerald-400 to-green-500',
      units: [
        { id: 'bio-u1', title: 'Unit 1', subtitles: [] },
        { id: 'bio-u2', title: 'Unit 2', subtitles: [] },
      ]
    },
    {
      id: 'math',
      name: 'Math',
      bg: '/src/assets/subjects/math-bg.jpg',
      colorClass: 'from-cyan-400 to-blue-500',
      units: [
        { id: 'math-u1', title: 'Unit 1', subtitles: [] },
        { id: 'math-u2', title: 'Unit 2', subtitles: [] },
      ]
    },
    {
      id: 'phy',
      name: 'Physics',
      bg: '/src/assets/subjects/physics-bg.jpg',
      colorClass: 'from-yellow-400 to-orange-500',
      units: [
        { id: 'phy-u1', title: 'Unit 1', subtitles: [] }
      ]
    },
    {
      id: 'chem',
      name: 'Chemistry',
      bg: '/src/assets/subjects/chemistry-bg.jpg',
      colorClass: 'from-purple-400 to-violet-500',
      units: [
        { id: 'chem-u1', title: 'Unit 1', subtitles: [] }
      ]
    }
  ]
}
