// User icons: Boly's little guy and characters from the games. A player who
// hasn't chosen one gets an icon assigned by user_id. Same list, in the same
// order, as the web (ffstudios-shop src/data/avatars.ts) and the API
// (src/utils/avatars.ts); how to add icons: "docs/Iconos de usuario.md" in the
// web repo. The images ship with the app in assets/avatars, copied from the
// web's public/avatars.

export type AvatarGroup = 'boly' | 'cerrajero' | 'robogolf'

export type Avatar = { id: string; group: AvatarGroup; name: string }

// Order matters: the assigned icon is picked by user_id from this list. Add new
// icons at the end, in all three repos.
export const AVATARS: Avatar[] = [
  { id: 'boly-lila', group: 'boly', name: 'Boly' },
  { id: 'cerrajero-pip', group: 'cerrajero', name: 'Pip' },
  { id: 'boly-celeste', group: 'boly', name: 'Boly' },
  { id: 'cerrajero-gloop', group: 'cerrajero', name: 'Gloop' },
  { id: 'robogolf-robot', group: 'robogolf', name: 'Robot' },
  { id: 'cerrajero-aurelia', group: 'cerrajero', name: 'Aurelia' },
  { id: 'boly-rosa', group: 'boly', name: 'Boly' },
  { id: 'cerrajero-mercurio', group: 'cerrajero', name: 'Mercurio' },
  { id: 'cerrajero-nimbo', group: 'cerrajero', name: 'Nimbo' },
  { id: 'boly-verde', group: 'boly', name: 'Boly' },
  { id: 'cerrajero-litho', group: 'cerrajero', name: 'Litho' },
  { id: 'cerrajero-anemona', group: 'cerrajero', name: 'Anémona' },
  { id: 'cerrajero-umbra', group: 'cerrajero', name: 'Umbra' },
  { id: 'cerrajero-vex', group: 'cerrajero', name: 'Vex' },
  { id: 'cerrajero-zancudo', group: 'cerrajero', name: 'Zancudo' }
]

// Saved in profile_picture_url when a player picks an icon, so the web and the
// other clients show it too.
export const PUBLIC_AVATAR_BASE = 'https://boly.cl/avatars'

const bundled = import.meta.glob<string>('../assets/avatars/*.webp', {
  eager: true,
  import: 'default'
})

// The copy shipped with the app, or the web's if this build doesn't have it yet.
export function avatarPath(id: string): string {
  return bundled[`../assets/avatars/${id}.webp`] ?? avatarPublicUrl(id)
}

export function avatarPublicUrl(id: string): string {
  return `${PUBLIC_AVATAR_BASE}/${id}.webp`
}

export function defaultAvatarId(userId: number | string | null | undefined): string {
  const id = Math.abs(Math.trunc(Number(userId))) || 0
  return AVATARS[id % AVATARS.length].id
}

// The id of the icon a picture URL points at, if it is one of ours.
export function avatarIdOf(url: string | null | undefined): string | null {
  if (!url?.startsWith(`${PUBLIC_AVATAR_BASE}/`)) return null
  const id = url.slice(PUBLIC_AVATAR_BASE.length + 1).replace(/\.webp$/, '')
  return AVATARS.some((a) => a.id === id) ? id : null
}

// What to show for a player: their picture, or the icon assigned to them.
export function avatarFor(
  userId: number | string | null | undefined,
  url: string | null | undefined
): string {
  const ownIcon = avatarIdOf(url)
  if (ownIcon) return avatarPath(ownIcon)
  return url || avatarPath(defaultAvatarId(userId))
}
