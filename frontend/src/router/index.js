import { createRouter, createWebHistory } from 'vue-router';
import UploadBook from '../pages/UploadBook.vue';
import AskQuestion from '../pages/AskQuestion.vue';
import Summarize from '../pages/Summarize.vue';
import Quiz from '../pages/Quiz.vue';
import Dashboard from '../pages/Dashboard.vue';

const routes = [
  { path: '/', component: Dashboard },
  { path: '/upload', component: UploadBook },
  { path: '/ask', component: AskQuestion },
  { path: '/summary', component: Summarize },
  { path: '/quiz', component: Quiz },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
