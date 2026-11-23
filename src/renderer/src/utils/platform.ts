import type { Game } from '@/types'

// A game with a phone build and nothing to install or open on a PC.
export function isPhoneOnly(game: Pick<Game, 'mobile_build_id' | 'file_name'>): boolean {
  return game.mobile_build_id != null && !game.file_name?.desktop && !game.file_name?.web
}
