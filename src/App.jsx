import React, { useState, useEffect, useRef } from 'react';
import OnlineLobby from './OnlineLobby.jsx';

// --- 音效系统 ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const playTone = (freq, type, duration, vol=0.1) => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
};

const sounds = {
    draw: () => playTone(400, 'sine', 0.1, 0.05),
    discard: () => playTone(200, 'sine', 0.15, 0.05),
    cabo: () => { playTone(523.25, 'triangle', 0.1); setTimeout(() => playTone(659.25, 'triangle', 0.3), 100); },
    error: () => playTone(150, 'sawtooth', 0.4, 0.1),
    success: () => playTone(800, 'sine', 0.2, 0.05),
    flip: () => playTone(300, 'square', 0.05, 0.02)
};

class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    render() {
        if (this.state.error) {
            return (
                <div className="min-h-[100dvh] bg-slate-950 text-white p-6 flex items-center justify-center">
                    <div className="max-w-xl rounded-2xl border border-red-400/30 bg-red-500/10 p-5">
                        <div className="text-lg font-black text-red-100 mb-2">页面渲染出错</div>
                        <pre className="text-xs whitespace-pre-wrap text-red-100/80">{this.state.error.message}</pre>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- 游戏核心数据结构 ---
const createDeck = () => {
    let newDeck = [];
    for (let i = 0; i <= 12; i++) {
        for (let j = 0; j < 4; j++) {
            newDeck.push({ id: Math.random().toString(36).substr(2, 9), val: i, isPublic: false });
        }
    }
    for (let j = 0; j < 2; j++) {
        newDeck.push({ id: Math.random().toString(36).substr(2, 9), val: 13, isPublic: false });
    }
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
};

// 获取卡牌代号 (A, B, C, D)
const getCardLetter = (player, cardId) => {
    if (!player) return 'C'; 
    const idx = player.cards.findIndex(c => c.id === cardId);
    if (idx === -1) return 'C';
    return String.fromCharCode(65 + idx); 
};

const getHandScore = (cards) => cards.reduce((sum, card) => sum + card.val, 0);

const getWorstCard = (cards) => cards.reduce((worst, card) => (
    card.val > worst.val ? card : worst
), cards[0]);

const shouldSwapInCard = (incomingCard, currentCard) => {
    if (!incomingCard || !currentCard) return false;
    return incomingCard.val < currentCard.val;
};

const shouldAIUseDiscard = (topDiscard, ai) => {
    const worstCard = getWorstCard(ai.cards);
    return shouldSwapInCard(topDiscard, worstCard) && topDiscard.val <= 6;
};

const shouldAICallCabo = (ai, playersCount) => {
    const score = getHandScore(ai.cards);
    const cardCount = ai.cards.length || 1;
    const average = score / cardCount;

    if (score <= 6) return true;
    if (score <= 8 && average <= 2.25) return Math.random() < 0.75;
    if (score <= 10 && average <= 2.5 && playersCount <= 3) return Math.random() < 0.35;
    return false;
};

// --- 精致卡牌渲染 ---
const PlayingCard = ({ val, isFaceUp, isMini = false, label = "" }) => {
    if (!isFaceUp) {
        return (
            <div className="w-full h-full rounded-[10%] border-[2px] md:border-[3px] border-white/20 flex flex-col items-center justify-center relative overflow-hidden shadow-inner bg-indigo-950" 
                 style={{
                     backgroundImage: `radial-gradient(circle at center, rgba(255,255,255,0.05) 0, transparent 70%), repeating-linear-gradient(45deg, rgba(0,0,0,0.3) 0, rgba(0,0,0,0.3) ${isMini ? '3px' : '4px'}, transparent ${isMini ? '3px' : '4px'}, transparent ${isMini ? '6px' : '8px'})`
                 }}>
                {label && (
                    <div className={`${isMini ? 'w-5 h-5 border' : 'w-8 h-8 border-2'} rounded-full bg-black/50 border-white/20 flex items-center justify-center backdrop-blur-sm shadow-md`}>
                        <span className={`text-white/90 font-serif font-black ${isMini ? 'text-[10px]' : 'text-sm'}`}>{label}</span>
                    </div>
                )}
            </div>
        );
    }

    let skillText = "";
    let theme = "";

    if (val >= 7 && val <= 8) { skillText = "偷看自己"; theme = "from-blue-100 to-cyan-300 text-blue-900"; }
    else if (val >= 9 && val <= 10) { skillText = "侦查对手"; theme = "from-purple-100 to-fuchsia-300 text-purple-900"; }
    else if (val >= 11 && val <= 12) { skillText = "互换卡牌"; theme = "from-orange-100 to-amber-300 text-orange-900"; }
    else if (val === 13) { theme = "from-red-200 to-rose-400 text-red-900"; }
    else if (val <= 4) { theme = "from-green-100 to-emerald-300 text-green-900"; }
    else { theme = "from-gray-100 to-slate-300 text-slate-800"; } 

    return (
        <div className={`w-full h-full rounded-[10%] border-[2px] md:border-[3px] border-white flex flex-col relative overflow-hidden shadow-inner bg-gradient-to-br ${theme}`}>
            <div className={`absolute top-1 left-1.5 font-bold ${isMini ? 'text-[9px]' : 'text-xs'} leading-none`}>{val}</div>
            <div className={`absolute bottom-1 right-1.5 font-bold ${isMini ? 'text-[9px]' : 'text-xs'} leading-none rotate-180`}>{val}</div>

            <div className="flex-1 flex flex-col items-center justify-center relative">
                <span className={`${isMini ? 'text-2xl' : 'text-4xl'} font-black drop-shadow-sm`}>{val}</span>
            </div>

            {skillText && !isMini && (
                <div className="absolute bottom-[8%] w-[90%] left-[5%] bg-black/85 rounded border border-white/30 text-white text-[10px] md:text-xs font-bold text-center py-0.5 z-20 whitespace-nowrap overflow-hidden shadow-sm">
                    {skillText}
                </div>
            )}
        </div>
    );
};

// --- 主游戏组件 (App) ---
export default function App() {
    const [appMode, setAppMode] = useState('local');
    const [gameState, setGameState] = useState('menu');
    const [players, setPlayers] = useState([]);
    const [deck, setDeck] = useState([]);
    const [discard, setDiscard] = useState([]);
    
    const [turn, setTurn] = useState(0);
    const [phase, setPhase] = useState('start');
    
    // 用对象来存储各人临时拿在手里的牌，key是 playerId
    const [drawnCards, setDrawnCards] = useState({}); 
    const [drawnSource, setDrawnSource] = useState(null); 
    const [caboCaller, setCaboCaller] = useState(null);
    
    const [logs, setLogs] = useState([]);
    const [peekedCards, setPeekedCards] = useState({});
    const [selectedCards, setSelectedCards] = useState([]);
    const [tempTarget, setTempTarget] = useState(null);
    const [highlightedCards, setHighlightedCards] = useState([]);
    
    const [aiActionText, setAiActionText] = useState(""); 

    // --- 慢动作物理飞行动画 ---
    const [isAnimating, setIsAnimating] = useState(false);
    const [flyingAnims, setFlyingAnims] = useState(null);
    const [hiddenDomIds, setHiddenDomIds] = useState([]);

    const logsEndRef = useRef(null);
    const aiTurnLockRef = useRef(null);
    const AI_TEXT_PAUSE = 2200;
    const AI_DECISION_PAUSE = 2600;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const addLog = (msg) => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), text: msg }]);
    };

    const narrateAI = async (msg, delay = AI_TEXT_PAUSE) => {
        setAiActionText(msg);
        await sleep(delay);
    };

    // --- 空间位移 FLIP 慢动画引擎 ---
    const animateAsync = (moves) => {
        return new Promise(resolve => {
            setIsAnimating(true);
            const anims = moves.map(m => {
                const srcEl = document.getElementById(m.fromId);
                const destEl = document.getElementById(m.toId);
                if (!srcEl || !destEl) return null;
                return { ...m, src: srcEl.getBoundingClientRect(), dest: destEl.getBoundingClientRect() };
            }).filter(Boolean);

            if (anims.length === 0) {
                setIsAnimating(false);
                resolve();
                return;
            }

            setFlyingAnims(anims);
            setHiddenDomIds(anims.map(a => a.cardId)); 

            setTimeout(() => {
                setFlyingAnims(prev => prev.map(a => ({ ...a, startMoving: true })));
                setTimeout(() => {
                    // 先恢复调用方，让目标位的真实卡牌在飞行动画下面完成渲染；
                    // 下一拍再撤掉飞行动画，避免“牌到位后卡一下才亮”的空档。
                    resolve();
                    setTimeout(() => {
                        setFlyingAnims(null);
                        setHiddenDomIds([]);
                        setIsAnimating(false);
                    }, 120);
                }, 1100);
            }, 50);
        });
    };

    const startGame = (playerCount) => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const newDeck = createDeck();
        const newPlayers = [];
        for (let i = 0; i < playerCount; i++) {
            newPlayers.push({
                id: `p${i}`,
                name: i === 0 ? '你 (玩家)' : `AI 玩家 ${i}`,
                isAI: i !== 0,
                cards: [newDeck.pop(), newDeck.pop(), newDeck.pop(), newDeck.pop()],
                score: 0,
                totalScore: 0
            });
        }
        
        const firstDiscard = newDeck.pop();
        firstDiscard.isPublic = true;

        setDeck(newDeck);
        setDiscard([firstDiscard]);
        setPlayers(newPlayers);
        setTurn(0);
        setCaboCaller(null);
        setLogs([]);
        setPeekedCards({});
        setHighlightedCards([]);
        setDrawnCards({});
        setAiActionText("");
        aiTurnLockRef.current = null;
        setPhase('peek_start');
        setGameState('peek_start');
        addLog("游戏开始！请点击并记住你的任意 2 张初始牌。");
    };

    const endTurn = (nextPlayersState = players, nextDiscardState = discard, nextDeckState = deck) => {
        setPhase('start');
        setDrawnCards({});
        setDrawnSource(null);
        setSelectedCards([]);
        setTempTarget(null);
        setPeekedCards({}); 

        let nextTurn = (turn + 1) % nextPlayersState.length;
        
        if (nextDeckState.length === 0) {
            addLog("牌库耗尽，重新洗牌...");
            const topDiscard = nextDiscardState[nextDiscardState.length - 1];
            const toShuffle = nextDiscardState.slice(0, nextDiscardState.length - 1).map(c => ({...c, isPublic: false})).sort(() => Math.random() - 0.5);
            setDeck(toShuffle);
            setDiscard([topDiscard]);
        } else {
            setDeck(nextDeckState);
            setDiscard(nextDiscardState);
        }

        if (nextTurn === caboCaller) {
            handleRoundOver(nextPlayersState);
        } else {
            setPlayers(nextPlayersState);
            setTurn(nextTurn);
            if (nextPlayersState[nextTurn].isAI) {
                setAiActionText(`🤖 ${nextPlayersState[nextTurn].name} 正在思考下一步...`);
            } else {
                setAiActionText("");
            }
        }
    };

    const handleRoundOver = (finalPlayers) => {
        setGameState('round_over');
        sounds.cabo();
        setHighlightedCards([]); 
        setAiActionText("");
        addLog("结算时刻！所有人翻开卡牌！");

        let updatedPlayers = finalPlayers.map(p => ({
            ...p, score: p.cards.reduce((acc, c) => acc + c.val, 0)
        }));

        let minScore = Math.min(...updatedPlayers.map(p => p.score));
        let caboPlayer = updatedPlayers[caboCaller];
        
        if (caboPlayer) {
            if (caboPlayer.score <= minScore) {
                addLog(`🎉 ${caboPlayer.name} CABO 成功！本局计 0 分！`);
                updatedPlayers[caboCaller].score = 0;
            } else {
                addLog(`💥 ${caboPlayer.name} CABO 失败！由于分数不是最低，追加 +10 分惩罚！`);
                updatedPlayers[caboCaller].score += 10;
            }
        }
        updatedPlayers = updatedPlayers.map(p => { p.totalScore += p.score; return p; });

        setPlayers(updatedPlayers);
        if (updatedPlayers.some(p => p.totalScore >= 100)) {
            setTimeout(() => setGameState('game_over'), 2500);
        }
    };

    const nextRound = () => {
        const newDeck = createDeck();
        let resetPlayers = players.map(p => ({
            ...p, cards: [newDeck.pop(), newDeck.pop(), newDeck.pop(), newDeck.pop()], score: 0
        }));
        
        const firstDiscard = newDeck.pop();
        firstDiscard.isPublic = true;
        
        setDeck(newDeck);
        setDiscard([firstDiscard]);
        setPlayers(resetPlayers);
        setTurn(Math.floor(Math.random() * players.length));
        setCaboCaller(null);
        setLogs([]);
        setPeekedCards({});
        setHighlightedCards([]);
        setDrawnCards({});
        setAiActionText("");
        aiTurnLockRef.current = null;
        setPhase('peek_start');
        setGameState('peek_start');
        addLog("新一回合！请点击选择你的 2 张初始牌。");
    };

    // --- 【修复点】：增加丢失的 callCabo 函数 ---
    const callCabo = () => {
        if (isAnimating || caboCaller !== null) return;
        sounds.cabo();
        setCaboCaller(turn);
        addLog(`🚨 ${players[turn].name} 行动：宣告了 CABO！`);
        endTurn();
    };

    const drawFromDeck = async () => {
        if (isAnimating || phase !== 'start') return;
        sounds.draw();
        setHighlightedCards([]);
        
        const card = deck[deck.length - 1];
        
        // 【精准轨迹1】从牌库飞到你个人的专属临时持牌位
        await animateAsync([{ cardId: card.id, fromId: 'deck-pile', toId: 'drawn-slot-p0', card, faceUp: false, isMiniSrc: false, label: '' }]);

        const newDeck = [...deck];
        newDeck.pop();
        setDrawnCards({ p0: card });
        setDrawnSource('deck');
        setDeck(newDeck);
        setPhase('drawn_deck');
        addLog(`你从牌库抽了一张暗牌，放在你的临时持牌位上。`);
    };

    const drawFromDiscard = async () => {
        if (isAnimating || phase !== 'start') return;
        sounds.draw();
        setHighlightedCards([]);
        
        const card = discard[discard.length - 1];
        card.isPublic = true; 
        
        // 【精准轨迹2】从弃牌堆飞到你个人的专属临时持牌位
        await animateAsync([{ cardId: card.id, fromId: 'discard-pile', toId: 'drawn-slot-p0', card, faceUp: true, isMiniSrc: false, label: '' }]);

        const newDiscard = [...discard];
        newDiscard.pop();
        setDrawnCards({ p0: card });
        setDrawnSource('discard');
        setDiscard(newDiscard);
        setPhase('swap_select'); 
        addLog(`你从弃牌堆拿走了明牌，放在你的临时持牌位上，准备替换。`);
    };

    const discardDrawnCard = async () => {
        if (isAnimating) return;
        sounds.discard();
        const card = drawnCards.p0;
        const cardToDiscard = { ...card, isPublic: true };
        
        // 【精准轨迹3】从你个人的专属持牌位飞到弃牌堆
        await animateAsync([{ cardId: card.id, fromId: 'drawn-slot-p0', toId: 'discard-pile', card: cardToDiscard, faceUp: true, isMiniSrc: false, label: '' }]);

        const newDiscard = [...discard, cardToDiscard];
        setDiscard(newDiscard); 
        addLog(`你选择放弃该牌并将其丢入弃牌堆。`);
        
        if (drawnSource === 'deck') {
            if (card.val >= 7 && card.val <= 8) { setPhase('peek_select'); addLog("✨ 触发【偷看】技能：请点击你的一张手牌查看。"); return; }
            if (card.val >= 9 && card.val <= 10) { setPhase('spy_select'); addLog("✨ 触发【侦查】技能：请点击对手的一张手牌查看。"); return; }
            if (card.val >= 11 && card.val <= 12) { setPhase('swap_any_first'); addLog("✨ 触发【互换】技能：请选择你或对手的一张牌，之后必须与另一方交换。"); return; }
        }
        
        endTurn(players, newDiscard, deck);
    };

    const skipSkill = () => {
        if (isAnimating) return;
        sounds.discard();
        addLog(`放弃技能：你选择不指定任何卡牌，直接结束回合。`);
        endTurn(players, discard, deck);
    };

    const confirmSwap = async () => {
        if (isAnimating || selectedCards.length === 0) return;
        const currentPlayer = players[turn];
        const card = drawnCards.p0;
        
        const selectedValues = selectedCards.map(id => currentPlayer.cards.find(c => c.id === id).val);
        const isMatch = selectedValues.every(v => v === selectedValues[0]);

        let newPlayers = [...players];
        let newDiscard = [...discard];
        let newDeck = [...deck];

        if (isMatch) {
            sounds.success();
            const logLetters = selectedCards.map(id => getCardLetter(currentPlayer, id)).join(' 和 ');
            addLog(`✅ 替换成功！你用新牌替换了你的手牌 [${logLetters}]。`);
            
            // 【多轨精确定位飞牌】
            const moves = [];
            // 新牌飞入手牌中被替换掉的第一张物理卡槽中
            moves.push({ cardId: card.id, fromId: 'drawn-slot-p0', toId: `card-${selectedCards[0]}`, card, faceUp: true, isMiniSrc: false, label: getCardLetter(currentPlayer, selectedCards[0]) });
            
            // 被替换的旧牌们飞向弃牌堆
            selectedCards.forEach(id => {
                const c = currentPlayer.cards.find(c=>c.id===id);
                moves.push({ cardId: id, fromId: `card-${id}`, toId: 'discard-pile', card: {...c, isPublic: true}, faceUp: true, isMiniSrc: false, label: '' });
            });

            await animateAsync(moves);
            
            const cardsToDiscard = currentPlayer.cards.filter(c => selectedCards.includes(c.id)).map(c => ({...c, isPublic: true}));
            newDiscard = [...newDiscard, ...cardsToDiscard];
            
            let newCards = [];
            let cardInserted = false;
            currentPlayer.cards.forEach(c => {
                if (selectedCards.includes(c.id)) {
                    if (!cardInserted) { newCards.push(card); cardInserted = true; }
                } else {
                    newCards.push(c);
                }
            });

            newPlayers[turn].cards = newCards;
            setHighlightedCards([card.id]); 
        } else {
            sounds.error();
            addLog(`❌ 替换失败！你记错了手牌的点数。新牌退回，强行罚抽一张。`);
            
            const penaltyCard = newDeck.pop();
            penaltyCard.isPublic = false;
            
            // 动画：新牌飞入你手牌末尾，罚抽牌从牌库飞入你手牌末尾
            const moves = [
                { cardId: card.id, fromId: 'drawn-slot-p0', toId: `player-p0-container`, card, faceUp: true, isMiniSrc: false, label: '' },
                { cardId: penaltyCard.id, fromId: 'deck-pile', toId: `player-p0-container`, card: penaltyCard, faceUp: false, isMiniSrc: false, label: '' }
            ];
            await animateAsync(moves);

            newPlayers[turn].cards = [...currentPlayer.cards, card, penaltyCard];
            setHighlightedCards([card.id, penaltyCard.id]); 
        }
        
        endTurn(newPlayers, newDiscard, newDeck);
    };

    const handleCardClick = async (card, ownerId) => {
        if (isAnimating) return;
        const isOwn = ownerId === players[turn].id;
        
        if (gameState === 'peek_start' && isOwn) {
            sounds.flip();
            const currentPeeked = Object.keys(peekedCards).length;
            if (peekedCards[card.id]) {
                const newPeek = {...peekedCards}; delete newPeek[card.id]; setPeekedCards(newPeek);
            } else if (currentPeeked < 2) {
                setPeekedCards({...peekedCards, [card.id]: true});
            }
            return;
        }

        if (phase === 'swap_select' && isOwn) {
            sounds.flip();
            if (selectedCards.includes(card.id)) setSelectedCards(selectedCards.filter(id => id !== card.id));
            else setSelectedCards([...selectedCards, card.id]);
            return;
        }

        if (phase === 'peek_select' && isOwn) {
            sounds.flip();
            if (peekedCards[card.id]) {
                endTurn(); 
            } else {
                setPeekedCards({ [card.id]: true });
                setHighlightedCards([card.id]); 
                addLog(`你偷看了自己的手牌 [${getCardLetter(players[0], card.id)}]。`);
            }
            return;
        }
        
        if (phase === 'spy_select' && !isOwn) {
             sounds.flip();
             if (peekedCards[card.id]) {
                 endTurn(); 
             } else {
                 setPeekedCards({ [card.id]: true });
                 setHighlightedCards([card.id]); 
                 const targetPlayer = players.find(p=>p.id===ownerId);
                 addLog(`你侦查了 ${targetPlayer.name} 的卡牌 [${getCardLetter(targetPlayer, card.id)}]。`);
             }
             return;
        }

        if (phase === 'swap_any_first') {
            sounds.flip();
            setTempTarget({ card, ownerId });
            setPhase('swap_any_second');
            if (ownerId === players[turn].id) {
                addLog("👉 已选定你自己的牌。请点击任意对手的一张牌完成互换。");
            } else {
                addLog("👉 已选定对手的牌。请点击你自己的一张牌完成互换。");
            }
            return;
        }

        if (phase === 'swap_any_second') {
            const currentPlayerId = players[turn].id;
            if (tempTarget.card.id === card.id) {
                sounds.error();
                addLog("不能选择同一张牌。请重新点击另一个互换目标。");
                return; 
            }
            if (tempTarget.ownerId === ownerId) {
                sounds.error();
                addLog("互换技能必须在你和另一名玩家之间进行，不能交换同一个人的两张牌。");
                return;
            }
            if (tempTarget.ownerId !== currentPlayerId && ownerId !== currentPlayerId) {
                sounds.error();
                addLog("互换技能必须包含你自己的一张牌，不能只交换两个对手之间的牌。");
                return;
            }

            sounds.success();
            let newPlayers = [...players];
            let player1 = newPlayers.find(p => p.id === tempTarget.ownerId);
            let player2 = newPlayers.find(p => p.id === ownerId);
            
            const p1Letter = getCardLetter(player1, tempTarget.card.id);
            const p2Letter = getCardLetter(player2, card.id);
            
            const moves = [
                { cardId: tempTarget.card.id, fromId: `card-${tempTarget.card.id}`, toId: `card-${card.id}`, card: tempTarget.card, faceUp: tempTarget.card.isPublic || peekedCards[tempTarget.card.id], isMiniSrc: tempTarget.ownerId !== players[0].id, label: p1Letter },
                { cardId: card.id, fromId: `card-${card.id}`, toId: `card-${tempTarget.card.id}`, card: card, faceUp: card.isPublic || peekedCards[card.id], isMiniSrc: ownerId !== players[0].id, label: p2Letter }
            ];
            await animateAsync(moves);
            
            let index1 = player1.cards.findIndex(c => c.id === tempTarget.card.id);
            let index2 = player2.cards.findIndex(c => c.id === card.id);
            
            let temp = player1.cards[index1];
            player1.cards[index1] = player2.cards[index2];
            player2.cards[index2] = temp;
            
            addLog(`🔄 互换完成：${player1.name} 的 [${p1Letter}] 与 ${player2.name} 的 [${p2Letter}] 互换了位置！`);
            
            setHighlightedCards([tempTarget.card.id, card.id]); 
            endTurn(newPlayers, discard, deck);
        }
    };

    // --- AI 逻辑 ---
    useEffect(() => {
        if (gameState !== 'playing' || !players[turn]?.isAI || isAnimating) return;

        const ai = players[turn];
        const aiTurnKey = [
            gameState,
            turn,
            ai.id,
            ai.cards.map(c => c.id).join('|'),
            deck.length,
            discard[discard.length - 1]?.id || 'empty'
        ].join(':');

        if (aiTurnLockRef.current === aiTurnKey) return;
        aiTurnLockRef.current = aiTurnKey;
        
        const playAI = async () => {
            setHighlightedCards([]);
            
            await narrateAI(`正在决定第一步要摸哪里的牌...`, AI_DECISION_PAUSE);
            
            const aiScore = getHandScore(ai.cards);
            const worstCard = getWorstCard(ai.cards);

            if (caboCaller === null && shouldAICallCabo(ai, players.length)) {
                sounds.cabo();
                setCaboCaller(turn);
                addLog(`🚨 ${ai.name} 行动：估算自己总分约 ${aiScore}，宣告了 "CABO"！`);
                await narrateAI(`${ai.name} 觉得自己的总分已经很低，宣告 CABO，本轮进入最后一圈。`);
                endTurn();
                return;
            }

            const topDiscard = discard[discard.length - 1];
            if (topDiscard && shouldAIUseDiscard(topDiscard, ai)) {
                // AI 拿弃牌堆
                const replaceCard = worstCard;
                const aiLetter = getCardLetter(ai, replaceCard.id);
                await narrateAI(`看中弃牌堆的 [${topDiscard.val}]，它比自己最差的 [${aiLetter}] 更小，决定拿走`);
                
                const drawnPublic = { ...topDiscard, isPublic: true };
                sounds.draw();
                
                // 【精确定位飞牌】从弃牌堆飞到这个 AI 的专属临时持牌位
                await animateAsync([{ cardId: topDiscard.id, fromId: 'discard-pile', toId: `drawn-slot-${ai.id}`, card: drawnPublic, faceUp: true, isMiniSrc: false, label: '' }]);
                setDrawnCards({ [ai.id]: drawnPublic });
                
                await narrateAI(`先把这张 [${topDiscard.val}] 拿在临时位上，盯着自己的手牌想一想...`, AI_DECISION_PAUSE);
                
                sounds.success();
                
                await narrateAI(`用手里的 [${topDiscard.val}] 替换位置为 [${aiLetter}] 的高分牌 [${replaceCard.val}]`);
                
                // 【精确定位双轨道飞行】
                await animateAsync([
                    { cardId: drawnPublic.id, fromId: `drawn-slot-${ai.id}`, toId: `card-${replaceCard.id}`, card: drawnPublic, faceUp: true, isMiniSrc: false, label: aiLetter },
                    { cardId: replaceCard.id, fromId: `card-${replaceCard.id}`, toId: 'discard-pile', card: {...replaceCard, isPublic: true}, faceUp: true, isMiniSrc: true, label: '' }
                ]);
                
                let newPlayers = [...players];
                let newDiscard = [...discard.slice(0, -1), { ...replaceCard, isPublic: true }];
                newPlayers[turn].cards = ai.cards.map(c => c.id === replaceCard.id ? drawnPublic : c);
                
                addLog(`🤖 ${ai.name} 行动：用弃牌堆的 ${topDiscard.val} 换掉了自己的 [${aiLetter}]（${replaceCard.val}）。`);
                setHighlightedCards([drawnPublic.id]); 
                endTurn(newPlayers, newDiscard, deck);
            } else {
                // AI 从牌库抽牌
                await narrateAI(`决定从牌库摸一张暗牌，看看点数...`);
                
                const drawn = deck[deck.length - 1];
                sounds.draw();
                
                // 【精确定位飞牌】从牌堆飞到这个 AI 自己的专属临时持牌位上
                await animateAsync([{ cardId: drawn.id, fromId: 'deck-pile', toId: `drawn-slot-${ai.id}`, card: drawn, faceUp: false, isMiniSrc: false, label: '' }]);
                setDrawnCards({ [ai.id]: drawn });
                
                await narrateAI(`AI 正捂着新牌偷偷看点数，先别急，它还在盘算...`, AI_DECISION_PAUSE);

                const deckReplaceCard = getWorstCard(ai.cards);
                const shouldKeepDrawn = drawn.val <= 6 && shouldSwapInCard(drawn, deckReplaceCard);

                if (shouldKeepDrawn) {
                    // AI 决定进行替换
                    const aiLetter = getCardLetter(ai, deckReplaceCard.id);
                    sounds.success();
                    
                    await narrateAI(`摸到 [${drawn.val}]，比位置 [${aiLetter}] 的 [${deckReplaceCard.val}] 更好，决定替换`);
                    
                    // 【精确定位双轨道飞行】
                    await animateAsync([
                        { cardId: drawn.id, fromId: `drawn-slot-${ai.id}`, toId: `card-${deckReplaceCard.id}`, card: drawn, faceUp: false, isMiniSrc: false, label: aiLetter },
                        { cardId: deckReplaceCard.id, fromId: `card-${deckReplaceCard.id}`, toId: 'discard-pile', card: {...deckReplaceCard, isPublic: true}, faceUp: true, isMiniSrc: true, label: '' }
                    ]);

                    let newPlayers = [...players];
                    let newDiscard = [...discard, { ...deckReplaceCard, isPublic: true }];
                    let newDeck = [...deck.slice(0, -1)];
                    newPlayers[turn].cards = ai.cards.map(c => c.id === deckReplaceCard.id ? drawn : c);
                    
                    addLog(`🤖 ${ai.name} 行动：抽到 ${drawn.val}，换掉了自己的 [${aiLetter}]（${deckReplaceCard.val}）。`);
                    setHighlightedCards([drawn.id]); 
                    endTurn(newPlayers, newDiscard, newDeck);
                } else {
                    // AI 觉得太大，直接扔掉
                    await narrateAI(`摸到 [${drawn.val}]，但自己最差的牌也只是 [${deckReplaceCard.val}]，不值得换，直接扔掉`);
                    
                    sounds.discard();
                    // 【精确定位飞牌】从 AI 临时位飞向中间弃牌堆并亮出来
                    await animateAsync([{ cardId: drawn.id, fromId: `drawn-slot-${ai.id}`, toId: 'discard-pile', card: {...drawn, isPublic: true}, faceUp: true, isMiniSrc: false, label: '' }]);
                    
                    let newDiscard = [...discard, { ...drawn, isPublic: true }]; 
                    let newDeck = [...deck.slice(0, -1)];
                    
                    // AI 对功能技能牌的处理
                    if (drawn.val >= 7 && drawn.val <= 8) {
                        await narrateAI(`卡牌技能触发！选择【偷看】自己的一张卡牌...`, AI_DECISION_PAUSE);
                        
                        const peekCard = ai.cards[Math.floor(Math.random() * ai.cards.length)];
                        addLog(`👁️ ${ai.name} 弃置了 ${drawn.val}，顺便发动技能偷看了它的卡牌 [${getCardLetter(ai, peekCard.id)}]。`);
                        setHighlightedCards([peekCard.id]); 
                        endTurn(players, newDiscard, newDeck);
                    }
                    else if (drawn.val >= 9 && drawn.val <= 10) {
                        await narrateAI(`卡牌技能触发！选择【侦查】你的一张卡牌...`, AI_DECISION_PAUSE);
                        
                        const targetCard = players[0].cards[Math.floor(Math.random() * players[0].cards.length)];
                        addLog(`🕵️ ${ai.name} 弃置了 ${drawn.val}，顺便发动技能看了一眼你的卡牌 [${getCardLetter(players[0], targetCard.id)}]！`);
                        setHighlightedCards([targetCard.id]); 
                        endTurn(players, newDiscard, newDeck);
                    }
                    else if (drawn.val >= 11 && drawn.val <= 12) {
                         await narrateAI(`卡牌技能触发！正在挑选自己的一张牌和别人一张牌发动【互换】...`, AI_DECISION_PAUSE);
                         
                         let newPlayers = [...players];
                         const otherCards = newPlayers
                             .filter(p => p.id !== ai.id)
                             .flatMap(p => p.cards.map(c => ({ card: c, ownerId: p.id })));
                         
                         let target1 = { card: getWorstCard(ai.cards), ownerId: ai.id };
                         let target2 = otherCards.reduce((best, target) => (
                             target.card.val < best.card.val ? target : best
                         ), otherCards[0]);

                         if (!target2 || !shouldSwapInCard(target2.card, target1.card)) {
                            addLog(`🤖 ${ai.name} 弃置了 ${drawn.val}，但没找到值得交换的目标，放弃互换。`);
                            endTurn(players, newDiscard, newDeck);
                            return;
                         }

                         let player1 = newPlayers.find(p => p.id === target1.ownerId);
                         let player2 = newPlayers.find(p => p.id === target2.ownerId);
                         let index1 = player1.cards.findIndex(c => c.id === target1.card.id);
                         let index2 = player2.cards.findIndex(c => c.id === target2.card.id);
                         
                         const p1Letter = getCardLetter(player1, target1.card.id);
                         const p2Letter = getCardLetter(player2, target2.card.id);
                         
                         await narrateAI(`发动【互换】技能：开始交换 [${player1.name}的${p1Letter}] 与 [${player2.name}的${p2Letter}] 的位置`);

                         // 跨越全场的物理慢飞行交换！
                         await animateAsync([
                            { cardId: target1.card.id, fromId: `card-${target1.card.id}`, toId: `card-${target2.card.id}`, card: target1.card, faceUp: target1.card.isPublic, isMiniSrc: target1.ownerId !== players[0].id, label: p1Letter },
                            { cardId: target2.card.id, fromId: `card-${target2.card.id}`, toId: `card-${target1.card.id}`, card: target2.card, faceUp: target2.card.isPublic, isMiniSrc: target2.ownerId !== players[0].id, label: p2Letter }
                         ]);
                         
                         let temp = player1.cards[index1];
                         player1.cards[index1] = player2.cards[index2];
                         player2.cards[index2] = temp;
                         
                         addLog(`🔄 ${ai.name} 弃置了 ${drawn.val}并互换了卡牌：将 ${player1.name} 的 [${p1Letter}] 与 ${player2.name} 的 [${p2Letter}] 对调了位置！`);
                         setHighlightedCards([target1.card.id, target2.card.id]); 
                         endTurn(newPlayers, newDiscard, newDeck);
                         return;
                    } else {
                        addLog(`🤖 ${ai.name} 行动：丢弃大牌，不做任何动作，直接结束回合。`);
                        endTurn(players, newDiscard, newDeck);
                    }
                }
            }
        };
        playAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turn, gameState, isAnimating]);

    const renderCardWrapper = (card, ownerId, forceFaceUp = false, isMini = false) => {
        const isSelected = selectedCards.includes(card.id) || tempTarget?.card.id === card.id;
        const isRecentlyActed = highlightedCards.includes(card.id);
        const showFace = forceFaceUp || peekedCards[card.id] || gameState === 'round_over' || gameState === 'game_over' || card.isPublic; 
        const canChooseSwapSecond = phase === 'swap_any_second' && tempTarget && ownerId !== tempTarget.ownerId && (
            ownerId === players[turn].id || tempTarget.ownerId === players[turn].id
        );
        
        const isClickable = !isAnimating && (
            (gameState === 'peek_start' && ownerId === players[0].id) ||
            (phase === 'swap_select' && ownerId === players[turn].id) ||
            (phase === 'peek_select' && ownerId === players[turn].id) ||
            (phase === 'spy_select' && ownerId !== players[turn].id) ||
            (phase === 'swap_any_first') || 
            canChooseSwapSecond
        );  

        const sizeClasses = isMini 
            ? 'w-[10vw] h-[15vw] max-w-[3.5rem] max-h-[5.25rem]' 
            : 'w-[14vw] h-[21vw] max-w-[5rem] max-h-[7.5rem] md:w-[5.5rem] md:h-[8.25rem]';

        const playerObj = players.find(p => p.id === ownerId);
        const cardLetter = getCardLetter(playerObj, card.id);

        return (
            <div 
                key={card.id}
                id={`card-${card.id}`}
                onClick={() => isClickable ? handleCardClick(card, ownerId) : null}
                className={`${sizeClasses} rounded-xl cursor-pointer transition-all duration-300 transform select-none relative
                    ${isSelected ? 'ring-4 ring-yellow-400 -translate-y-2 shadow-2xl scale-105 z-20' : ''}
                    ${isRecentlyActed ? 'ring-4 ring-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.8)] z-30' : ''}
                    ${isClickable && !isRecentlyActed && !isSelected ? 'ring-2 ring-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.5)] hover:ring-white active:scale-95 hover:-translate-y-1' : ''}
                    ${hiddenDomIds.includes(card.id) ? 'opacity-0' : 'opacity-100'}`}
            >
                <PlayingCard val={card.val} isFaceUp={showFace} isMini={isMini} label={cardLetter} />
                
                {card.isPublic && gameState === 'playing' && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-white shadow-[0_0_10px_rgba(250,204,21,0.8)] animate-pulse"></div>
                )}
                
                {isRecentlyActed && gameState === 'playing' && (
                    <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-pink-600 text-white text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg animate-bounce">
                        被操作过
                    </div>
                )}
            </div>
        );
    };

    // 辅助渲染玩家专属临时持牌位
    const renderDrawnSlot = (playerId, isMini = false) => {
        const card = drawnCards[playerId];
        const isHidden = card && hiddenDomIds.includes(card.id);
        const playerObj = players.find(p => p.id === playerId);
        const isSelf = playerId === 'p0';

        const sizeClasses = isMini 
            ? 'w-[10vw] h-[15vw] max-w-[3.5rem] max-h-[5.25rem]' 
            : 'w-[14vw] h-[21vw] max-w-[5rem] max-h-[7.5rem] md:w-[5.5rem] md:h-[8.25rem]';

        return (
            <div 
                id={`drawn-slot-${playerId}`} 
                className={`${sizeClasses} rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center bg-white/5 relative transition-opacity duration-300`}
            >
                {card && !isHidden ? (
                    <div className="absolute inset-0">
                        <PlayingCard 
                            val={card.val} 
                            isFaceUp={isSelf || card.isPublic} 
                            isMini={isMini} 
                            label=""
                        />
                    </div>
                ) : (
                    <div className="text-[10px] text-white/20 text-center select-none font-bold leading-none px-1">
                        {isSelf ? "持牌" : "持牌"}
                    </div>
                )}
            </div>
        );
    };

    if (appMode === 'online') {
        return (
            <AppErrorBoundary>
                <OnlineLobby onBack={() => setAppMode('local')} />
            </AppErrorBoundary>
        );
    }

    return (
        <div className="h-[100dvh] w-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-slate-900 via-indigo-950 to-black text-white font-sans overflow-hidden flex flex-col relative">
            
            {/* 极速慢动作飞行卡牌蒙版 */}
            {flyingAnims && (
                <div className="fixed inset-0 z-[100] pointer-events-none">
                    {flyingAnims.map((anim, i) => {
                        const style = anim.startMoving ? {
                            transform: `translate(${anim.dest.left - anim.src.left}px, ${anim.dest.top - anim.src.top}px) scale(${anim.dest.width / anim.src.width}, ${anim.dest.height / anim.src.height})`,
                            transition: 'transform 1.1s ease-in-out'
                        } : {
                            transform: 'translate(0px, 0px) scale(1, 1)',
                            transition: 'none'
                        };

                        return (
                            <div key={i} className="absolute transform-gpu origin-top-left drop-shadow-2xl z-[100]" style={{
                                left: anim.src.left,
                                top: anim.src.top,
                                width: anim.src.width,
                                height: anim.src.height,
                                ...style
                            }}>
                                <PlayingCard val={anim.card.val} isFaceUp={anim.faceUp} isMini={anim.isMiniSrc} label={anim.label || ''} />
                            </div>
                        );
                    })}
                </div>
            )}

            {gameState === 'menu' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/60 p-4">
                    <div className="bg-slate-900/90 border border-white/10 p-8 md:p-10 rounded-3xl shadow-2xl text-center w-full max-w-sm backdrop-blur-xl">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 rotate-3 shadow-lg border-2 border-white/20">
                            <span className="text-4xl font-black text-white">C</span>
                        </div>
                        <h1 className="text-5xl font-black mb-1 tracking-widest text-white drop-shadow-md">CABO</h1>
                        <p className="text-white/50 mb-8 text-sm tracking-wider">专属临时持牌位 / 飞行重构版</p>
                        <div className="space-y-4">
                            <button onClick={() => setAppMode('online')} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl transition-all font-black text-lg shadow-lg active:scale-95 text-white">
                                在线联机房间
                            </button>
                            {[3, 4, 5].map(n => (
                                <button key={n} onClick={() => startGame(n)} className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-all font-bold text-lg shadow-md active:scale-95 text-white/90">
                                    {n} 人局对战
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {gameState !== 'menu' && (
                <div className="flex-1 flex flex-col h-full w-full max-w-4xl mx-auto p-2 md:p-4 z-10 relative">
                    
                    {/* 顶部：对手 (带专属临时持牌位) */}
                    <div className="flex justify-start md:justify-center overflow-x-auto gap-3 md:gap-5 pb-2 w-full snap-x scrollbar-hide pt-2 min-h-[110px]">
                        {players.filter(p => p.isAI).map(p => (
                            <div key={p.id} id={`player-${p.id}-container`} className={`flex-shrink-0 snap-center flex flex-col items-center bg-black/40 backdrop-blur-md border ${players[turn]?.id === p.id ? 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.2)]' : 'border-white/10'} rounded-2xl p-2 md:p-3 transition-all min-w-[190px]`}>
                                <div className="text-xs font-bold flex items-center gap-1 text-white/90 mb-1">
                                    🤖 {p.name}
                                    {caboCaller === players.findIndex(pl => pl.id === p.id) && <span className="bg-gradient-to-r from-red-500 to-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm ml-1">CABO</span>}
                                </div>
                                <div className="text-[9px] bg-white/10 px-2 rounded text-white/60 mb-2">分数: {p.totalScore}</div>
                                <div className="flex gap-2 items-center">
                                    <div className="flex gap-1">
                                        {p.cards.map(c => renderCardWrapper(c, p.id, false, true))}
                                    </div>
                                    <div className="border-l border-white/20 pl-2">
                                        {renderDrawnSlot(p.id, true)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 中部：游戏区 */}
                    <div className="flex-1 flex flex-col items-center justify-center w-full relative py-1">
                        
                        {/* 实时保姆级解说栏 */}
                        <div className="mb-4 px-4 py-3 bg-gradient-to-r from-indigo-900/90 to-purple-900/90 backdrop-blur-xl border border-white/20 rounded-2xl text-xs md:text-sm font-bold text-yellow-100 shadow-xl max-w-[95%] md:max-w-md w-full min-h-[52px] text-center flex items-center justify-center gap-2">
                            {isAnimating ? <span className="animate-spin text-white">⚙️</span> : <span className="animate-pulse text-green-400">●</span>}
                            <span className="leading-snug">
                                {gameState === 'peek_start' && `初始准备: 请点击查看你任意的两张牌`}
                                {gameState === 'playing' && players[turn]?.isAI && `${aiActionText}`}
                                {gameState === 'playing' && players[turn]?.id === players[0].id && (
                                    <>
                                        {phase === 'start' && "你的回合: 请点击抽牌或宣告 CABO"}
                                        {phase === 'drawn_deck' && "你抽到了暗牌, 正在你的临时位上，请选择操作"}
                                        {phase === 'spy_select' && "✨ 触发技能: 请点击对手的一张牌进行侦查"}
                                        {phase === 'peek_select' && "✨ 触发技能: 请点击自己的一张牌进行偷看"}
                                        {phase === 'swap_any_first' && "✨ 发动互换: 先选你或对手的一张牌"}
                                        {phase === 'swap_any_second' && "👉 再选另一方的一张牌完成互换"}
                                        {phase === 'swap_select' && "请点击你的手牌进行替换 (可多选相同点数的牌)"}
                                    </>
                                )}
                            </span>
                        </div>

                        {/* 公共牌堆 */}
                        <div className="flex justify-center items-end gap-6 md:gap-12 w-full mb-4">
                            <div className="flex flex-col items-center">
                                <div 
                                    id="deck-pile"
                                    className={`w-[14vw] h-[21vw] max-w-[4.5rem] max-h-[6.5rem] rounded-xl cursor-pointer shadow-xl relative transition-transform ${phase === 'start' && players[turn]?.id === players[0].id && !isAnimating ? 'hover:-translate-y-2 ring-2 ring-blue-400' : 'opacity-80'}`}
                                    onClick={() => (phase === 'start' && players[turn]?.id === players[0].id) ? drawFromDeck() : null}
                                >
                                    <PlayingCard isFaceUp={false} isMini={false} label="C" />
                                    <div className="absolute -bottom-2 right-[-6px] bg-black text-white text-[9px] px-1.5 rounded-full border border-white/20 shadow-lg">{deck.length}</div>
                                </div>
                                <span className="text-[10px] text-white/50 mt-2 font-bold tracking-widest">牌库 (暗)</span>
                            </div>

                            <div className="flex flex-col items-center">
                                <div 
                                    id="discard-pile"
                                    className={`w-[14vw] h-[21vw] max-w-[4.5rem] max-h-[6.5rem] rounded-xl cursor-pointer shadow-xl transition-transform ${phase === 'start' && players[turn]?.id === players[0].id && discard.length > 0 && !isAnimating ? 'hover:-translate-y-2 ring-2 ring-green-400' : 'opacity-100'} ${hiddenDomIds.includes(discard[discard.length-1]?.id) ? 'opacity-0' : ''}`}
                                    onClick={() => (phase === 'start' && players[turn]?.id === players[0].id && discard.length > 0) ? drawFromDiscard() : null}
                                >
                                    {discard.length > 0 ? (
                                        <PlayingCard val={discard[discard.length-1].val} isFaceUp={true} isMini={false} />
                                    ) : (
                                        <div className="w-full h-full rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center bg-white/5">
                                            <span className="text-white/20 text-[10px]">空</span>
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] text-white/50 mt-2 font-bold tracking-widest">弃牌堆 (明)</span>
                            </div>
                        </div>

                        {/* 下方控制按键区域 */}
                        <div className="flex flex-wrap justify-center items-center gap-2 md:gap-4 w-full px-2 min-h-[44px]">
                            {gameState === 'peek_start' && players[0].id === players[turn]?.id && (
                                <button 
                                    onClick={() => { 
                                        if (isAnimating) return;
                                        setPhase('start'); 
                                        setGameState('playing'); 
                                        setPeekedCards({}); 
                                        addLog("你已准备完毕，卡牌已盖上，游戏正式开始。"); 
                                    }} 
                                    disabled={Object.keys(peekedCards).length !== 2 || isAnimating}
                                    className={`px-6 py-2.5 rounded-full font-bold shadow-xl transition-all text-xs md:text-sm w-full max-w-[200px] ${Object.keys(peekedCards).length === 2 && !isAnimating ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white active:scale-95 shadow-blue-500/30' : 'bg-gray-800/80 text-gray-500 border border-white/10'}`}
                                >
                                    {Object.keys(peekedCards).length === 2 ? '我记住了，准备开始' : `请看任意2张 (${Object.keys(peekedCards).length}/2)`}
                                </button>
                            )}

                            {gameState === 'playing' && phase === 'start' && players[turn]?.id === players[0].id && caboCaller === null && (
                                <button onClick={callCabo} disabled={isAnimating} className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-600 rounded-full font-bold shadow-lg shadow-red-600/20 text-xs md:text-sm border border-red-400/50 active:scale-95 text-white disabled:opacity-50">
                                    🚨 宣告 CABO
                                </button>
                            )}

                            {gameState === 'playing' && phase === 'drawn_deck' && players[turn]?.id === players[0].id && !isAnimating && (
                                <>
                                    <button onClick={() => {setPhase('swap_select'); addLog("请点击你下方的手牌，选定后点击确认替换。");}} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full font-bold shadow-lg shadow-green-500/20 text-xs md:text-sm active:scale-95 text-white">
                                        ⬇️ 替换我的手牌
                                    </button>
                                    <button onClick={discardDrawnCard} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full font-bold shadow-lg shadow-blue-500/20 text-xs md:text-sm active:scale-95 text-white">
                                        {drawnCards.p0?.val >= 7 && drawnCards.p0?.val <= 12 ? '✨ 弃置并发动技能' : '❌ 觉得太大，直接弃置'}
                                    </button>
                                </>
                            )}

                            {gameState === 'playing' && phase === 'swap_select' && drawnSource === 'discard' && players[turn]?.id === players[0].id && selectedCards.length === 0 && (
                                <div className="px-4 py-2 text-yellow-300 text-xs bg-black/50 rounded-full border border-yellow-500/30 animate-pulse">
                                    请在下方手牌中点击选择要被换掉的目标。
                                </div>
                            )}

                            {gameState === 'playing' && phase === 'swap_select' && players[turn]?.id === players[0].id && selectedCards.length > 0 && !isAnimating && (
                                <button onClick={confirmSwap} className="px-6 py-2.5 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full font-bold shadow-[0_0_15px_rgba(52,211,153,0.5)] text-xs md:text-sm active:scale-95 animate-bounce text-gray-900">
                                    确认丢弃并替换 ({selectedCards.length}张)
                                </button>
                            )}
                            
                            {/* 放弃使用技能的权利 */}
                            {gameState === 'playing' && 
                             (phase === 'peek_select' || phase === 'spy_select' || phase === 'swap_any_first' || phase === 'swap_any_second') && 
                             players[turn]?.id === players[0].id && !isAnimating && (
                                <button onClick={skipSkill} className="px-5 py-2 bg-gradient-to-r from-gray-700 to-gray-800 rounded-full font-bold shadow-lg text-xs md:text-sm border border-gray-500/30 active:scale-95 text-red-300 ml-2">
                                    取消技能选定 (直接结束回合)
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 底部：你(玩家)的区域 - 现在带有你专属的临时持牌位 */}
                    {players[0] && (
                        <div id={`player-${players[0]?.id}-container`} className={`mt-auto mb-2 w-full max-w-xl self-center flex flex-col items-center bg-black/40 backdrop-blur-xl border ${players[turn]?.id === players[0].id ? 'border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'border-white/10'} rounded-3xl p-3 md:p-5 transition-colors`}>
                            <div className="flex w-full justify-between items-center mb-3 px-1">
                                <div className="text-sm md:text-base font-black flex items-center gap-2 text-white">
                                    👤 {players[0]?.name}
                                    {caboCaller === 0 && <span className="bg-gradient-to-r from-red-500 to-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm">CABO</span>}
                                </div>
                                <div className="text-xs bg-black/50 px-3 py-1 rounded-full border border-white/10">累积总分: <span className="font-bold text-yellow-400 text-sm">{players[0]?.totalScore}</span></div>
                            </div>
                            
                            <div className="flex gap-2.5 md:gap-4 justify-center items-center w-full relative">
                                {gameState === 'playing' && phase === 'swap_select' && players[turn]?.id === players[0].id && !isAnimating && selectedCards.length === 0 && (
                                    <div className="absolute inset-y-0 left-0 w-[78%] border-2 border-cyan-400 border-dashed rounded-xl animate-pulse pointer-events-none"></div>
                                )}
                                
                                <div className="flex gap-2 md:gap-4 flex-1 justify-center border-r border-white/10 pr-2">
                                    {players[0]?.cards.map(c => renderCardWrapper(c, players[0].id, false, false))}
                                </div>
                                <div className="pl-1 flex flex-col items-center shrink-0">
                                    {renderDrawnSlot('p0', false)}
                                    <span className="text-[9px] text-yellow-300 font-bold mt-1.5 select-none">临时持牌位</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PC/大屏右侧文字转播日志 */}
            {gameState !== 'menu' && (
                <div className="hidden lg:flex absolute right-0 top-0 w-80 h-full bg-black/60 backdrop-blur-md border-l border-white/10 flex-col z-20 pointer-events-none">
                    <div className="p-4 border-b border-white/10 font-black text-yellow-400 tracking-widest text-center text-lg">
                        游戏实况转播
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 pointer-events-auto">
                        {logs.map((log, idx) => (
                            <div key={idx} className={`bg-white/5 rounded-lg p-2.5 border-l-2 text-xs xl:text-sm leading-relaxed ${log.text.includes('🚨') ? 'border-red-500 text-red-100 bg-red-900/20' : log.text.includes('🎉') ? 'border-yellow-400 text-yellow-100' : 'border-blue-400 text-white/80'}`}>
                                <span className="text-white/30 text-[10px] block mb-1">{log.time}</span>
                                {log.text}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}

            {/* 结算 */}
            {gameState === 'round_over' && (
                <div className="absolute inset-0 z-50 flex items-start justify-center backdrop-blur-md bg-black/85 p-2 md:p-4 overflow-y-auto pt-10 pb-10">
                    <div className="bg-gradient-to-b from-indigo-950 to-slate-900 border border-white/20 p-4 md:p-6 rounded-3xl shadow-2xl w-full max-w-lg max-h-full flex flex-col my-auto animate-[fadeIn_0.3s_ease-out]">
                        <h2 className="text-2xl md:text-3xl font-black mb-4 text-center text-yellow-400 shrink-0 tracking-widest drop-shadow">回合结算</h2>
                        
                        <div className="overflow-y-auto flex-1 space-y-3 pr-1 scrollbar-hide">
                            {players.map(p => (
                                <div key={p.id} className={`flex flex-col p-3 rounded-2xl ${p.id === players[0].id ? 'bg-blue-600/20 border border-blue-400/50 shadow-inner' : 'bg-black/40 border border-white/10'}`}>
                                    <div className="flex justify-between items-center mb-3 px-1">
                                        <span className="font-bold text-sm md:text-base">{p.name}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-white/80 text-xs md:text-sm">本局: <span className="text-yellow-400 font-black text-base md:text-lg">+{p.score}</span></span>
                                            <span className="font-bold text-white/50 text-xs border-l border-white/20 pl-3">累积: {p.totalScore}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-center gap-2">
                                        {p.cards.map(c => (
                                            <div key={c.id} className="w-[11vw] h-[16vw] max-w-[3.5rem] max-h-[5rem]">
                                                <PlayingCard val={c.val} isFaceUp={true} isMini={true} label={getCardLetter(p, c.id)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <button onClick={nextRound} className="mt-5 w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl font-black text-base md:text-lg shadow-[0_0_15px_rgba(59,130,246,0.5)] active:scale-95 text-white shrink-0">
                            进入下一回合
                        </button>
                    </div>
                </div>
            )}
            
            {/* 结束 */}
            {gameState === 'game_over' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-xl bg-black/90 p-4">
                    <div className="bg-gradient-to-br from-yellow-900/40 to-red-900/40 border-2 border-yellow-500/50 p-8 rounded-[2rem] shadow-[0_0_50px_rgba(250,204,21,0.2)] text-center w-full max-w-md backdrop-blur-md">
                        <div className="text-6xl mb-4">🏆</div>
                        <h2 className="text-4xl font-black mb-2 text-yellow-400">游戏结束</h2>
                        <p className="mb-6 text-white/60 text-xs">有人分数突破了危险红线</p>
                        
                        <div className="space-y-3 mb-8">
                            {[...players].sort((a,b)=>a.totalScore-b.totalScore).map((p, idx) => (
                                <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl text-sm ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/40 to-yellow-600/20 border border-yellow-400 scale-105 my-3 shadow-lg' : 'bg-black/30 border border-white/5'}`}>
                                    <span className="font-bold flex items-center gap-2 text-sm">
                                        {idx === 0 && <span className="text-lg">👑</span>} {p.name}
                                    </span>
                                    <span className={`font-black ${idx === 0 ? 'text-yellow-300 text-xl' : 'text-white/80 text-base'}`}>{p.totalScore}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setGameState('menu')} className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-bold active:scale-95 text-white transition-colors">
                            返回主菜单
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
