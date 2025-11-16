import { defineConfig } from 'cypress'

export default defineConfig({
  video: true,
  videosFolder: 'cypress/videos',
  e2e: {
    baseUrl: 'http://localhost:61812',
  },
})
