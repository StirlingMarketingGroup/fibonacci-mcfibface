import { navigate } from '../lib/router'
import { getName, setName } from '../lib/storage'

export function renderHomePage() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const savedName = getName()

  app.innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 class="text-5xl font-bold mb-2">fibonacci-mcfibface</h1>
      <p class="text-gray-400 mb-8">Planning poker for teams</p>

      <div class="w-full max-w-sm space-y-4">
        <input
          type="text"
          id="name-input"
          placeholder="Your name"
          value="${savedName}"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />

        <button
          id="create-room-btn"
          class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors"
        >
          Create Room
        </button>
      </div>
    </div>
  `

  const nameInput = document.querySelector<HTMLInputElement>('#name-input')!
  const createBtn = document.querySelector<HTMLButtonElement>('#create-room-btn')!

  // Update button state based on name
  function updateButtonState() {
    createBtn.disabled = !nameInput.value.trim()
  }
  updateButtonState()

  nameInput.addEventListener('input', () => {
    setName(nameInput.value.trim())
    updateButtonState()
  })

  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim()
    if (!name) return

    setName(name)

    // Generate a random room ID
    const roomId = generateRoomId()
    navigate(`/room/${roomId}`)
  })
}

function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}
