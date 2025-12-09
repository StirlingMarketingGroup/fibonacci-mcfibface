import './style.css'
import { renderHomePage } from './pages/home'
import { renderRoomPage } from './pages/room'

function router() {
  const path = window.location.pathname

  // Room page: /room/:id
  const roomMatch = path.match(/^\/room\/([a-zA-Z0-9]+)$/)
  if (roomMatch) {
    renderRoomPage(roomMatch[1])
    return
  }

  // Home page
  renderHomePage()
}

// Handle browser back/forward
window.addEventListener('popstate', router)

// Initial render
router()
