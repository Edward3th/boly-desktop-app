import '@fontsource/poppins/400.css'
import '@fontsource/poppins/700.css'
import '@fontsource/anton/400.css'
import './toast.css'

// The page inside the achievement notice window (main/services/
// AchievementToastWindow.ts). The main process sends one notice at a time
// and gives each the same time the animation in toast.css takes.

interface AchievementToast {
  apiName: string
  name: Record<string, string> | null
  description: Record<string, string> | null
  iconUrl: string | null
  target: number
}

// Same language rule as the rest of the app (i18n follows the OS language)
const lang = navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
const LABEL = lang === 'es' ? '¡Logro desbloqueado!' : 'Achievement unlocked!'

const TROPHY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 2H6v2H2v3a5 5 0 0 0 4.6 5A6 6 0 0 0 11 15.9V19H7v3h10v-3h-4v-3.1A6 6 0 0 0 17.4 12 5 5 0 0 0 22 7V4h-4V2ZM4 7V6h2v3.8A3 3 0 0 1 4 7Zm16 0a3 3 0 0 1-2 2.8V6h2v1Z"/></svg>`

const localized = (text: Record<string, string> | null): string =>
  (text && (text[lang] || text.es || text.en)) || ''

// "NIVEL_5_COMPLETO" -> "Nivel 5 completo", for an achievement whose name
// couldn't be loaded
const fromApiName = (apiName: string): string => {
  const words = apiName.toLowerCase().replace(/_+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const container = document.getElementById('toast')!

function render(toast: AchievementToast): void {
  container.replaceChildren()
  container.classList.remove('play')

  const icon = document.createElement('div')
  icon.className = 'icon'
  if (toast.iconUrl) {
    const img = document.createElement('img')
    img.src = toast.iconUrl
    img.alt = ''
    img.onerror = () => {
      icon.innerHTML = TROPHY_SVG
      icon.classList.add('trophy')
    }
    icon.appendChild(img)
  } else {
    icon.innerHTML = TROPHY_SVG
    icon.classList.add('trophy')
  }

  const text = document.createElement('div')
  text.className = 'text'
  const label = document.createElement('span')
  label.className = 'label'
  label.textContent = LABEL
  const name = document.createElement('strong')
  name.className = 'name'
  name.textContent = localized(toast.name) || fromApiName(toast.apiName)
  text.append(label, name)
  const description = localized(toast.description)
  if (description) {
    const desc = document.createElement('span')
    desc.className = 'description'
    desc.textContent = description
    text.appendChild(desc)
  }

  container.append(icon, text)
  // Restart the animation even when two notices come back to back
  void container.offsetWidth
  container.classList.add('play')
  chime()
}

let audio: AudioContext | null = null

// A short two-note chime made with Web Audio: no sound file to ship or license
function chime(): void {
  try {
    audio ??= new AudioContext()
    const start = audio.currentTime + 0.05
    const notes: Array<[number, number]> = [
      [1046.5, 0], // C6
      [1568.0, 0.12] // G6
    ]
    for (const [frequency, offset] of notes) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'triangle'
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0, start + offset)
      gain.gain.linearRampToValueAtTime(0.18, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.6)
      osc.connect(gain).connect(audio.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.65)
    }
  } catch (error) {
    console.error('Achievement chime failed:', error)
  }
}

// @ts-ignore — exposed by the preload script
window.electron.ipcRenderer.on('achievement-toast', (_event: unknown, toast: AchievementToast) => render(toast))
