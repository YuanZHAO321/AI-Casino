/**
 * GameModule 契约：平台与具体游戏的边界。
 *
 * 防天眼核心约束：
 *  - 完整状态 TState（含牌靴等隐藏信息）只在引擎内部流转；
 *  - 任何要进入 AI prompt 的信息必须先经 projectView() 投影为 TView；
 *  - TView 类型在结构上不得包含未公开信息（牌靴、未发的牌）；
 *  - prompt 构建函数只接受 TView。
 */

export interface GameModule<TState, TView, TAction extends string> {
  readonly gameId: string
  /** 当前轮到的座位在当前态势下的合法操作（非法操作兜底的依据） */
  getLegalActions(state: TState): TAction[]
  /** 应用操作，返回新状态（内部可从牌靴抽牌） */
  applyAction(state: TState, action: TAction): TState
  /**
   * 以某座位的现实视角投影状态。
   * viewerId 为座位 id、'companion'（=玩家视角）或 'dealer'。
   */
  projectView(state: TState, viewerId: string): TView
  /** 非法/解析失败时的兜底操作（必须从 legal 中选） */
  fallbackAction(state: TState, legal: TAction[]): TAction
}
