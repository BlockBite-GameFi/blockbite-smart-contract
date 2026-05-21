// BlockBite TDP — Design Tokens (from TDP App design)
export const T = {
  bg0:      '#05040d',
  bg1:      '#09071a',
  bg2:      '#0e0c22',
  card:     'rgba(255,255,255,.042)',
  cardHov:  'rgba(255,255,255,.075)',
  border:   'rgba(167,139,255,.13)',
  borderHi: 'rgba(167,139,255,.4)',
  accent:   '#a78bff',
  accentDk: '#5e35d4',
  gold:     '#f5c66a',
  green:    '#5fd07a',
  red:      '#ff3b6b',
  blue:     '#7ad7ff',
  ember:    '#ff7a3a',
  muted:    'rgba(232,225,248,.38)',
  sideW:    224,
  mono:     "'JetBrains Mono',ui-monospace,monospace",
  serif:    "'Cinzel',serif",
} as const;

export type TKeys = typeof T;
