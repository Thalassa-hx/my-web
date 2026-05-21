export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;

export const PHASES = {
  LOBBY: 'lobby',
  PEEK_START: 'peek_start',
  START: 'start',
  DRAWN_DECK: 'drawn_deck',
  SWAP_SELECT: 'swap_select',
  PEEK_SELECT: 'peek_select',
  SPY_SELECT: 'spy_select',
  SWAP_ANY_FIRST: 'swap_any_first',
  SWAP_ANY_SECOND: 'swap_any_second',
  ROUND_OVER: 'round_over',
  GAME_OVER: 'game_over'
};

export const createDeck = () => {
  const deck = [];
  for (let val = 0; val <= 12; val += 1) {
    for (let copy = 0; copy < 4; copy += 1) {
      deck.push({ id: cryptoId(), val, isPublic: false });
    }
  }
  for (let copy = 0; copy < 2; copy += 1) {
    deck.push({ id: cryptoId(), val: 13, isPublic: false });
  }
  return shuffle(deck);
};

export const createRoom = ({ roomId, hostId, hostName, playerLimit = 3 }) => {
  const clampedLimit = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, playerLimit));
  return {
    id: roomId,
    hostId,
    playerLimit: clampedLimit,
    state: 'lobby',
    phase: PHASES.LOBBY,
    deck: [],
    discard: [],
    turn: 0,
    caboCaller: null,
    drawnCards: {},
    drawnSource: null,
    selectedCards: [],
    tempTarget: null,
    logs: [],
    players: [
      createPlayer({ id: hostId, name: hostName || '房主', isAI: false })
    ]
  };
};

export const createPlayer = ({ id, name, isAI = false }) => ({
  id,
  name: name || (isAI ? 'AI 玩家' : '玩家'),
  isAI,
  connected: true,
  ready: false,
  cards: [],
  knownCards: {},
  score: 0,
  totalScore: 0
});

export const joinRoom = (room, { playerId, name, isAI = false }) => {
  if (room.players.some(player => player.id === playerId)) return room;
  if (room.players.length >= room.playerLimit) {
    throw new Error('ROOM_FULL');
  }
  room.players.push(createPlayer({ id: playerId, name, isAI }));
  log(room, `${name || '玩家'} 加入了房间。`);
  return room;
};

export const startRound = (room) => {
  if (room.players.length < MIN_PLAYERS) throw new Error('NOT_ENOUGH_PLAYERS');

  const deck = createDeck();
  room.players.forEach(player => {
    player.cards = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    player.knownCards = {};
    player.score = 0;
  });

  const firstDiscard = deck.pop();
  firstDiscard.isPublic = true;

  room.deck = deck;
  room.discard = [firstDiscard];
  room.turn = 0;
  room.caboCaller = null;
  room.drawnCards = {};
  room.drawnSource = null;
  room.selectedCards = [];
  room.tempTarget = null;
  room.phase = PHASES.PEEK_START;
  room.state = 'playing';
  room.logs = [];
  log(room, '新一局开始。每位玩家先看自己的任意 2 张初始牌。');
  return room;
};

export const applyAction = (room, playerId, action) => {
  const playerIndex = room.players.findIndex(player => player.id === playerId);
  if (playerIndex === -1) throw new Error('PLAYER_NOT_IN_ROOM');
  const player = room.players[playerIndex];

  if (action.type === 'peek_initial') {
    ensure(room.phase === PHASES.PEEK_START, 'BAD_PHASE');
    ensure(player.cards.some(card => card.id === action.cardId), 'CARD_NOT_OWNED');
    player.knownCards[action.cardId] = true;
    return room;
  }

  if (action.type === 'ready_initial') {
    ensure(room.phase === PHASES.PEEK_START, 'BAD_PHASE');
    ensure(Object.keys(player.knownCards).length >= 2, 'PEEK_TWO_CARDS_FIRST');
    player.ready = true;
    if (room.players.every(nextPlayer => nextPlayer.ready || nextPlayer.isAI)) {
      room.players.forEach(nextPlayer => {
        nextPlayer.ready = false;
      });
      room.phase = PHASES.START;
      log(room, '所有玩家准备完毕，正式开始。');
    }
    return room;
  }

  ensure(room.state === 'playing', 'NOT_PLAYING');
  ensure(room.players[room.turn]?.id === playerId, 'NOT_YOUR_TURN');

  switch (action.type) {
    case 'call_cabo':
      ensure(room.caboCaller === null, 'CABO_ALREADY_CALLED');
      room.caboCaller = room.turn;
      log(room, `${player.name} 宣告了 CABO。`);
      return endTurn(room);

    case 'draw_deck':
      ensure(room.phase === PHASES.START, 'BAD_PHASE');
      drawDeck(room, player);
      room.phase = PHASES.DRAWN_DECK;
      room.drawnSource = 'deck';
      log(room, `${player.name} 从牌库摸了一张暗牌。`);
      return room;

    case 'draw_discard':
      ensure(room.phase === PHASES.START, 'BAD_PHASE');
      ensure(room.discard.length > 0, 'EMPTY_DISCARD');
      room.drawnCards[player.id] = { ...room.discard.pop(), isPublic: true };
      room.drawnSource = 'discard';
      room.phase = PHASES.SWAP_SELECT;
      log(room, `${player.name} 拿走了弃牌堆顶的明牌。`);
      return room;

    case 'discard_drawn':
      return discardDrawn(room, player);

    case 'swap_with_drawn':
      return swapWithDrawn(room, player, action.cardIds || []);

    case 'skill_peek':
      return skillPeek(room, player, action.cardId);

    case 'skill_spy':
      return skillSpy(room, player, action.ownerId, action.cardId);

    case 'skill_swap':
      return skillSwap(room, player, action.ownCardId, action.otherOwnerId, action.otherCardId);

    case 'skip_skill':
      ensure([PHASES.PEEK_SELECT, PHASES.SPY_SELECT, PHASES.SWAP_ANY_FIRST, PHASES.SWAP_ANY_SECOND].includes(room.phase), 'BAD_PHASE');
      log(room, `${player.name} 放弃了技能。`);
      return endTurn(room);

    default:
      throw new Error('UNKNOWN_ACTION');
  }
};

export const getPublicView = (room) => ({
  id: room.id,
  hostId: room.hostId,
  playerLimit: room.playerLimit,
  state: room.state,
  phase: room.phase,
  turnPlayerId: room.players[room.turn]?.id || null,
  caboCallerId: room.caboCaller === null ? null : room.players[room.caboCaller]?.id,
  deckCount: room.deck.length,
  discardTop: room.discard.at(-1) || null,
  logs: room.logs.slice(-80),
  players: room.players.map(player => ({
    id: player.id,
    name: player.name,
    isAI: player.isAI,
    connected: player.connected,
    ready: player.ready,
    cardCount: player.cards.length,
    score: player.score,
    totalScore: player.totalScore
  }))
});

export const getPrivateView = (room, playerId) => {
  const player = room.players.find(nextPlayer => nextPlayer.id === playerId);
  if (!player) return null;
  return {
    ...getPublicView(room),
    me: {
      id: player.id,
      hand: player.cards.map((card, index) => ({
        id: card.id,
        label: String.fromCharCode(65 + index),
        val: card.isPublic || player.knownCards[card.id] || room.phase === PHASES.ROUND_OVER ? card.val : null,
        isPublic: card.isPublic
      })),
      drawnCard: room.drawnCards[player.id] || null
    }
  };
};

const discardDrawn = (room, player) => {
  ensure(room.phase === PHASES.DRAWN_DECK, 'BAD_PHASE');
  const drawn = room.drawnCards[player.id];
  ensure(drawn, 'NO_DRAWN_CARD');
  const publicCard = { ...drawn, isPublic: true };
  room.discard.push(publicCard);
  delete room.drawnCards[player.id];
  log(room, `${player.name} 弃置了摸到的 ${publicCard.val}。`);

  if (publicCard.val >= 7 && publicCard.val <= 8) {
    room.phase = PHASES.PEEK_SELECT;
    return room;
  }
  if (publicCard.val >= 9 && publicCard.val <= 10) {
    room.phase = PHASES.SPY_SELECT;
    return room;
  }
  if (publicCard.val >= 11 && publicCard.val <= 12) {
    room.phase = PHASES.SWAP_ANY_FIRST;
    return room;
  }
  return endTurn(room);
};

const swapWithDrawn = (room, player, cardIds) => {
  ensure([PHASES.SWAP_SELECT, PHASES.DRAWN_DECK].includes(room.phase), 'BAD_PHASE');
  ensure(cardIds.length > 0, 'NO_CARD_SELECTED');
  const drawn = room.drawnCards[player.id];
  ensure(drawn, 'NO_DRAWN_CARD');

  const selected = cardIds.map(cardId => player.cards.find(card => card.id === cardId));
  ensure(selected.every(Boolean), 'CARD_NOT_OWNED');
  const isMatch = selected.every(card => card.val === selected[0].val);

  if (!isMatch) {
    const penalty = room.deck.pop();
    player.cards.push(drawn, penalty);
    delete room.drawnCards[player.id];
    log(room, `${player.name} 替换失败，罚抽一张。`);
    return endTurn(room);
  }

  const selectedSet = new Set(cardIds);
  let inserted = false;
  player.cards = player.cards.flatMap(card => {
    if (!selectedSet.has(card.id)) return [card];
    if (inserted) return [];
    inserted = true;
    return [drawn];
  });
  room.discard.push(...selected.map(card => ({ ...card, isPublic: true })));
  delete room.drawnCards[player.id];
  log(room, `${player.name} 完成了一次替换。`);
  return endTurn(room);
};

const skillPeek = (room, player, cardId) => {
  ensure(room.phase === PHASES.PEEK_SELECT, 'BAD_PHASE');
  ensure(player.cards.some(card => card.id === cardId), 'CARD_NOT_OWNED');
  player.knownCards[cardId] = true;
  log(room, `${player.name} 偷看了自己的一张牌。`);
  return endTurn(room);
};

const skillSpy = (room, player, ownerId, cardId) => {
  ensure(room.phase === PHASES.SPY_SELECT, 'BAD_PHASE');
  ensure(ownerId !== player.id, 'MUST_TARGET_OTHER_PLAYER');
  const target = room.players.find(nextPlayer => nextPlayer.id === ownerId);
  ensure(target?.cards.some(card => card.id === cardId), 'CARD_NOT_FOUND');
  player.knownCards[cardId] = true;
  log(room, `${player.name} 侦查了 ${target.name} 的一张牌。`);
  return endTurn(room);
};

const skillSwap = (room, player, ownCardId, otherOwnerId, otherCardId) => {
  ensure(room.phase === PHASES.SWAP_ANY_FIRST || room.phase === PHASES.SWAP_ANY_SECOND, 'BAD_PHASE');
  ensure(otherOwnerId !== player.id, 'MUST_SWAP_WITH_OTHER_PLAYER');
  const other = room.players.find(nextPlayer => nextPlayer.id === otherOwnerId);
  ensure(other, 'PLAYER_NOT_FOUND');

  const ownIndex = player.cards.findIndex(card => card.id === ownCardId);
  const otherIndex = other.cards.findIndex(card => card.id === otherCardId);
  ensure(ownIndex !== -1 && otherIndex !== -1, 'CARD_NOT_FOUND');

  const ownCard = player.cards[ownIndex];
  player.cards[ownIndex] = other.cards[otherIndex];
  other.cards[otherIndex] = ownCard;
  log(room, `${player.name} 将自己的一张牌与 ${other.name} 的一张牌进行了互换。`);
  return endTurn(room);
};

const drawDeck = (room, player) => {
  if (room.deck.length === 0) reshuffleDiscard(room);
  const card = room.deck.pop();
  ensure(card, 'EMPTY_DECK');
  room.drawnCards[player.id] = card;
};

const endTurn = (room) => {
  room.phase = PHASES.START;
  room.drawnCards = {};
  room.drawnSource = null;
  room.selectedCards = [];
  room.tempTarget = null;
  room.players.forEach(player => {
    player.ready = false;
  });

  const nextTurn = (room.turn + 1) % room.players.length;
  if (nextTurn === room.caboCaller) {
    return finishRound(room);
  }

  room.turn = nextTurn;
  return room;
};

const finishRound = (room) => {
  room.phase = PHASES.ROUND_OVER;
  room.state = 'round_over';
  room.players.forEach(player => {
    player.score = player.cards.reduce((sum, card) => sum + card.val, 0);
  });

  const minScore = Math.min(...room.players.map(player => player.score));
  const caboPlayer = room.caboCaller === null ? null : room.players[room.caboCaller];
  if (caboPlayer) {
    if (caboPlayer.score <= minScore) {
      caboPlayer.score = 0;
      log(room, `${caboPlayer.name} CABO 成功，本局 0 分。`);
    } else {
      caboPlayer.score += 10;
      log(room, `${caboPlayer.name} CABO 失败，追加 10 分。`);
    }
  }

  room.players.forEach(player => {
    player.totalScore += player.score;
    player.cards = player.cards.map(card => ({ ...card, isPublic: true }));
  });

  if (room.players.some(player => player.totalScore >= 100)) {
    room.phase = PHASES.GAME_OVER;
    room.state = 'game_over';
  }
  return room;
};

const reshuffleDiscard = (room) => {
  const top = room.discard.pop();
  room.deck = shuffle(room.discard.map(card => ({ ...card, isPublic: false })));
  room.discard = top ? [top] : [];
};

const shuffle = (cards) => {
  const nextCards = [...cards];
  for (let index = nextCards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextCards[index], nextCards[swapIndex]] = [nextCards[swapIndex], nextCards[index]];
  }
  return nextCards;
};

const log = (room, text) => {
  room.logs.push({ time: new Date().toISOString(), text });
};

const ensure = (condition, errorCode) => {
  if (!condition) throw new Error(errorCode);
};

const cryptoId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Math.random().toString(36).slice(2, 11);
};
