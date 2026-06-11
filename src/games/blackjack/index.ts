import { GameModule } from '@/core/game'
import { BlackjackAction, BlackjackState, TableView } from './types'
import { getLegalActions, applyAction } from './engine'
import { projectView } from './projection'
import { fallbackAction } from './basicStrategy'

export const blackjackModule: GameModule<BlackjackState, TableView, BlackjackAction> = {
  gameId: 'blackjack',
  getLegalActions,
  applyAction,
  projectView,
  fallbackAction
}

export * from './types'
export * from './engine'
export * from './hand'
export * from './sideBets'
export * from './basicStrategy'
export { projectView } from './projection'
