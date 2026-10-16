import fs from 'fs'
import path from 'path'

// A build can carry its achievements in boly/achievements.json (+ icons) next
// to the executable: Boly reads it when the build is uploaded. The player
// never needs it, and it would spell out hidden achievements, so the
// installer drops it from the extracted build before it goes live.
//
// Same places Boly looks (boly-sdk spec/ACHIEVEMENTS_MANIFEST.md): the build
// root, or under one top-level folder. Only a boly/ folder that actually
// holds an achievements.json is removed — a game's own folder that happens to
// be named "boly" stays.
export function removeAchievementManifest(buildRoot: string): string[] {
  const parents = [buildRoot]
  for (const entry of fs.readdirSync(buildRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) parents.push(path.join(buildRoot, entry.name))
  }

  const removed: string[] = []
  for (const parent of parents) {
    const bolyDir = findChild(parent, 'boly', true)
    if (!bolyDir || !findChild(bolyDir, 'achievements.json', false)) continue
    fs.rmSync(bolyDir, { recursive: true, force: true })
    removed.push(bolyDir)
  }
  return removed
}

// Case-insensitive lookup, like the zip check on the API side.
function findChild(dir: string, name: string, wantDirectory: boolean): string | null {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const hit = entries.find(
    (e) => e.name.toLowerCase() === name && (wantDirectory ? e.isDirectory() : e.isFile())
  )
  return hit ? path.join(dir, hit.name) : null
}
