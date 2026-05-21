import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_CABO_SERVER_URL || window.location.origin;
const normalizeRoomCode = value => String(value || '').replace(/[^a-z0-9]/gi, '').slice(0, 4);
const submitRoomCode = value => normalizeRoomCode(value).toUpperCase();

export default function OnlineLobby({ onBack }) {
  const [socket, setSocket] = useState(null);
  const [name, setName] = useState('玩家');
  const [roomCode, setRoomCode] = useState('');
  const [playerLimit, setPlayerLimit] = useState(3);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  const isHost = Boolean(room) && room.hostId === room.me?.id;
  const canStart = Boolean(room) && room.state === 'lobby' && isHost && room.players.length >= 3;

  useEffect(() => {
    const nextSocket = io(SERVER_URL);
    setSocket(nextSocket);
    nextSocket.on('connect', () => setConnected(true));
    nextSocket.on('disconnect', () => setConnected(false));
    nextSocket.on('room:update', nextRoom => {
      setRoom(nextRoom);
      setError('');
    });
    nextSocket.on('connect_error', () => {
      setError('联机服务器没有连接上，请确认 npm run server 正在运行。');
    });
    return () => nextSocket.disconnect();
  }, []);

  const sortedPlayers = useMemo(() => room?.players || [], [room]);

  const callServer = (eventName, payload) => {
    if (!socket) return;
    socket.emit(eventName, payload, response => {
      if (!response?.ok) {
        setError(response?.error || '操作失败，请稍后再试。');
      } else if (response.roomId) {
        setRoomCode(submitRoomCode(response.roomId));
      }
    });
  };

  return (
    <div className="h-[100dvh] w-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-slate-900 via-indigo-950 to-black text-white overflow-hidden flex flex-col">
      <header className="shrink-0 border-b border-white/10 bg-black/30 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm font-bold">
          返回
        </button>
        <div className="text-center">
          <div className="text-lg font-black tracking-[0.2em]">CABO ONLINE</div>
          <div className="text-[10px] text-white/50">3-5 人联机房间</div>
        </div>
        <div className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>
          {connected ? '在线' : '离线'}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto grid gap-4 lg:grid-cols-[360px_1fr]">
          <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
            <label className="block text-xs text-white/60 mb-1">昵称</label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3 text-sm outline-none focus:border-blue-400"
            />

            <div className="mt-4">
              <label className="block text-xs text-white/60 mb-2">房间人数</label>
              <div className="grid grid-cols-3 gap-2">
                {[3, 4, 5].map(count => (
                  <button
                    key={count}
                    onClick={() => setPlayerLimit(count)}
                    className={`py-2 rounded-xl border text-sm font-bold ${playerLimit === count ? 'bg-blue-500 border-blue-300' : 'bg-white/10 border-white/10'}`}
                  >
                    {count} 人
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => callServer('room:create', { name, playerLimit })}
              className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 font-black shadow-lg"
            >
              创建联机房间
            </button>

            <div className="mt-5 pt-5 border-t border-white/10">
              <label className="block text-xs text-white/60 mb-1">加入房间码</label>
              <div className="flex gap-2">
                <input
                  value={roomCode}
                  onChange={event => setRoomCode(normalizeRoomCode(event.target.value))}
                  placeholder="ABCD"
                  maxLength={4}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-white/10 border border-white/10 rounded-xl px-3 py-3 text-sm uppercase outline-none focus:border-blue-400"
                />
                <button
                  onClick={() => callServer('room:join', { roomId: submitRoomCode(roomCode), name })}
                  className="px-4 rounded-xl bg-white/10 border border-white/10 text-sm font-bold"
                >
                  加入
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            )}
          </section>

          <section className="bg-black/40 border border-white/10 rounded-2xl p-4 min-h-[460px]">
            {!room ? (
              <div className="h-full min-h-[360px] flex items-center justify-center text-center text-white/50 text-sm">
                创建或加入房间后，这里会显示玩家座位、房间码和开局状态。
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <div className="text-xs text-white/50">房间码</div>
                    <div className="text-3xl font-black tracking-[0.25em] text-yellow-300">{room.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/50">状态</div>
                    <div className="text-sm font-bold text-white/90">{room.state} / {room.phase}</div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mt-4">
                  {sortedPlayers.map(player => (
                    <div key={player.id} className={`rounded-xl border p-3 ${player.id === room.turnPlayerId ? 'border-yellow-300 bg-yellow-500/10' : 'border-white/10 bg-white/5'}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-black text-sm">{player.isAI ? 'AI ' : ''}{player.name}</div>
                        <div className={`text-[10px] px-2 py-1 rounded-full ${player.connected || player.isAI ? 'bg-emerald-500/20 text-emerald-100' : 'bg-red-500/20 text-red-100'}`}>
                          {player.isAI ? 'AI' : player.connected ? '在线' : '离线'}
                        </div>
                      </div>
                      <div className="mt-3 flex justify-between text-xs text-white/60">
                        <span>手牌 {player.cardCount}</span>
                        <span>总分 {player.totalScore}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {room.me?.hand?.length > 0 && (
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <div className="text-xs text-white/50 mb-2">我的手牌视图</div>
                    <div className="flex flex-wrap gap-2">
                      {room.me.hand.map(card => (
                        <div key={card.id} className="w-14 h-20 rounded-xl border border-white/20 bg-indigo-950 flex items-center justify-center font-black">
                          {card.val ?? card.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-5 flex flex-wrap gap-2">
                  {isHost && room.state === 'lobby' && (
                    <button
                      onClick={() => callServer('room:add-ai', { roomId: room.id })}
                      className="px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm font-bold"
                    >
                      添加 AI
                    </button>
                  )}
                  {isHost && room.state === 'lobby' && (
                    <button
                      disabled={!canStart}
                      onClick={() => callServer('room:start', { roomId: room.id })}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-sm font-black disabled:opacity-40"
                    >
                      开始房间
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
