const NAME_KEY = 'fibonacci-mcfibface-name'
const ROOM_PREFIX = 'fibonacci-mcfibface-room-'

export function getName(): string {
  return localStorage.getItem(NAME_KEY) || ''
}

export function setName(name: string) {
  localStorage.setItem(NAME_KEY, name)
}

interface RoomIdentity {
  odI: string
  emoji: string
}

export function getRoomIdentity(roomId: string): RoomIdentity | null {
  const data = localStorage.getItem(ROOM_PREFIX + roomId)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function setRoomIdentity(roomId: string, odI: string, emoji: string) {
  localStorage.setItem(ROOM_PREFIX + roomId, JSON.stringify({ odI, emoji }))
}
