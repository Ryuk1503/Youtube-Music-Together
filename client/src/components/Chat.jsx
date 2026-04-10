import { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle } from 'lucide-react';

export default function Chat({ messages, onSendMessage, username }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col border-t border-dark-500 min-h-0">
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center gap-2 flex-shrink-0">
        <MessageCircle size={16} className="text-primary-400" />
        <h3 className="text-white font-semibold text-sm">Chat</h3>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-dark-400 text-xs text-center py-4">Chưa có tin nhắn</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="text-sm">
            <span
              className={`font-medium ${
                msg.username === username ? 'text-primary-400' : 'text-green-400'
              }`}
            >
              {msg.username}
            </span>
            <span className="text-dark-400 text-xs ml-1.5">{formatTime(msg.timestamp)}</span>
            <p className="text-dark-100 break-words">{msg.text}</p>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 flex-shrink-0">
        <div className="flex gap-2">
          <input
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
