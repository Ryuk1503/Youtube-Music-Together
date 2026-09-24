import { useState, useRef, useEffect } from 'react';
import { Send, Reply, X, Heart, Pencil, Trash2, Crown } from 'lucide-react';

export default function Chat({ messages, onSendMessage, username, userId, onAction }) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.at(-1)?.id, messages.length]);

  useEffect(() => {
    if (editingId && !messages.some(message => message.id === editingId)) setEditingId(null);
    if (replyTo) {
      const updated = messages.find(message => message.id === replyTo.id);
      if (updated !== replyTo) setReplyTo(updated || null);
    }
  }, [messages, editingId, replyTo]);

  const actOnMessage = async (action, payload) => {
    if (pending) return;
    setPending(true);
    setActionError('');
    try {
      await onAction(action, payload);
      if (action === 'edit') setEditingId(null);
    } catch (error) { setActionError(error.message); }
    finally { setPending(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim(), replyTo?.id);
    setText('');
    setReplyTo(null);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col border-t border-dark-500 min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-dark-400 text-xs text-center py-4">Chưa có tin nhắn</p>
        )}
        {messages.map((msg, i) => {
          const previous = messages[i - 1];
          const gap = previous ? new Date(msg.timestamp).getTime() - new Date(previous.timestamp).getTime() : NaN;
          const sameSender = previous && (previous.userId != null && msg.userId != null ? previous.userId === msg.userId : previous.username === msg.username);
          const continuation = sameSender && gap >= 0 && gap <= 3 * 60 * 1000;
          const own = userId != null && msg.userId != null && String(msg.userId) === String(userId);
          const liked = (msg.hearts || []).includes(String(userId));
          const actionClass = 'p-1.5 rounded text-dark-200 hover:text-white hover:bg-dark-500 disabled:opacity-40';
          return (
          <div key={msg.id || i} className={`chat-message text-sm group relative px-1 rounded hover:bg-dark-600/40 ${i === 0 ? '' : continuation ? 'mt-0.5' : 'mt-3'}`}>
            {msg.id && editingId !== msg.id && <div role="toolbar" aria-label="Thao tác tin nhắn"
              className={`chat-actions absolute right-1 ${i === 0 ? 'top-0' : '-top-5'} z-10 flex items-center gap-0.5 p-0.5 bg-dark-800 border border-dark-400 rounded-lg shadow-lg`}>
              <button type="button" onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }} title="Trả lời" aria-label={`Trả lời ${msg.username}`} className={actionClass}><Reply size={16} /></button>
              <button type="button" disabled={pending} onClick={() => actOnMessage('heart', { messageId: msg.id, liked: !liked })} title={liked ? 'Bỏ tim' : 'Thả tim'} aria-label={liked ? 'Bỏ tim' : 'Thả tim'} aria-pressed={liked} className={`${actionClass} ${liked ? 'text-red-400' : ''}`}><Heart size={16} fill={liked ? 'currentColor' : 'none'} /></button>
              {own && <>
                <button type="button" disabled={pending} onClick={() => { setEditingId(msg.id); setEditText(msg.text); setActionError(''); }} title="Sửa" aria-label="Sửa tin nhắn" className={actionClass}><Pencil size={16} /></button>
                <button type="button" disabled={pending} onClick={() => actOnMessage('delete', { messageId: msg.id })} title="Xóa" aria-label="Xóa tin nhắn" className={`${actionClass} hover:!text-red-400`}><Trash2 size={16} /></button>
              </>}
            </div>}
            {!continuation && <><span
              className={`font-medium ${
                (msg.userId != null ? own : msg.username === username) ? 'text-primary-400' : 'text-green-400'
              }`}
            >
              {msg.username}
            </span>
            {msg.isAdmin && <Crown size={12} className="text-yellow-400 inline align-middle ml-1" />}
            <span className="text-dark-400 text-xs ml-1.5">{formatTime(msg.timestamp)}</span></>}
            {msg.replyTo && <blockquote className="mt-1 mb-1 border-l-2 border-primary-400 bg-dark-600/50 rounded-r px-2 py-1 text-xs">
              <span className="text-primary-300 font-medium">{msg.replyTo.username}</span>
              <p className="text-dark-200 line-clamp-2 break-words">{msg.replyTo.deleted ? 'Tin nhắn đã bị xóa' : msg.replyTo.text}</p>
            </blockquote>}
            {editingId === msg.id ? <form className="py-1" onSubmit={event => { event.preventDefault(); actOnMessage('edit', { messageId: msg.id, text: editText }); }}>
              <input autoFocus aria-label="Nội dung sửa" value={editText} maxLength={500} disabled={pending}
                onChange={event => setEditText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !pending) setEditingId(null); }}
                className="w-full px-2 py-1.5 bg-dark-600 border border-primary-500 rounded text-white text-sm focus:outline-none" />
              <div className="flex gap-3 mt-1 text-xs"><button type="submit" disabled={pending || !editText.trim()} className="text-primary-300 disabled:opacity-40">Lưu</button><button type="button" disabled={pending} onClick={() => setEditingId(null)} className="text-dark-200">Hủy</button></div>
            </form> : <p className="text-dark-100 break-words" title={formatTime(msg.timestamp)}>{msg.text}{msg.editedAt && <span className="text-dark-300 text-[10px] ml-1">(đã sửa)</span>}</p>}
            {!!msg.hearts?.length && <button type="button" disabled={pending} onClick={() => actOnMessage('heart', { messageId: msg.id, liked: !liked })}
              aria-label={`${msg.hearts.length} tim${liked ? ', có bạn' : ''}`} aria-pressed={liked}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 text-xs rounded border ${liked ? 'border-red-400/60 text-red-400 bg-red-400/10' : 'border-dark-400 text-dark-200'}`}><Heart size={12} fill={liked ? 'currentColor' : 'none'} />{msg.hearts.length}</button>}
          </div>
          );
        })}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 flex-shrink-0">
        {actionError && <p role="alert" className="text-red-400 text-xs mb-2">{actionError}</p>}
        {replyTo && <div className="flex items-center gap-2 mb-2 border-l-2 border-primary-400 bg-dark-600 rounded-r px-2 py-1.5">
          <div className="min-w-0 flex-1 text-xs">
            <p className="text-primary-300">Đang trả lời {replyTo.username}</p>
            <p className="text-dark-200 truncate">{replyTo.text}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Hủy trả lời" title="Hủy trả lời" className="p-1 text-dark-200 hover:text-white"><X size={15} /></button>
        </div>}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 px-3 py-2 bg-dark-600 border border-dark-400 rounded-lg text-white placeholder-dark-300 focus:outline-none focus:border-primary-500 text-sm transition"
            placeholder="Nhập tin nhắn..."
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="p-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-500 disabled:cursor-not-allowed text-white rounded-lg transition"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
