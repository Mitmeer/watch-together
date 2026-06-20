import { useEffect, useRef, useState } from 'react';

export default function Chat({ messages, onSend, connected }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || !connected) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>💬 Чат</span>
        <span className={`chat-status ${connected ? 'online' : 'offline'}`}>
          {connected ? 'онлайн' : 'офлайн'}
        </span>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">Напишите первое сообщение...</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-message">
              <span className="chat-author">{msg.userName}</span>
              <span className="chat-text">{msg.text}</span>
              <span className="chat-time">
                {new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))
        )}
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение..."
          maxLength={500}
          disabled={!connected}
        />
        <button type="submit" disabled={!connected || !text.trim()}>
          ➤
        </button>
      </form>
    </div>
  );
}
