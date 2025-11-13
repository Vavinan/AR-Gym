// Main entry point for Vite AR Fitness App
import './styles.css'
import FitnessARApp, { setupDebugFunctions } from './js/app.js'

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing AR Fitness App...')

  // Initialize the main app (this will initialize everything)
  window.app = new FitnessARApp()

  // Setup debug functions
  setupDebugFunctions()

  console.log('✓ AR Fitness App initialized')
})
