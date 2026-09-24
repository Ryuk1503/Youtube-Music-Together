// Rejoin after initial connection and every reconnect; ignore stale replies.
export function subscribeToRoom(socket, payload, onJoined, onError) {
  let active = true;
  let attempt = 0;
  const join = () => {
    const currentAttempt = ++attempt;
    socket.timeout(15000).emit('room:join', payload, (error, response) => {
      if (!active || currentAttempt !== attempt || !socket.connected) return;
      if (error) {
        onError('Không thể tải phòng. Vui lòng thử vào lại.');
      } else if (!response?.success) {
        onError(response?.error || 'Phòng không tồn tại hoặc đã bị xóa');
      } else {
        onJoined(response);
      }
    });
  };
  const disconnected = () => { ++attempt; };
  const connectionError = () => onError('Không thể kết nối máy chủ. Vui lòng thử lại.');
  socket.on('connect', join);
  socket.on('disconnect', disconnected);
  socket.on('connect_error', connectionError);
  if (socket.connected) join();
  return () => {
    active = false;
    socket.off('connect', join);
    socket.off('disconnect', disconnected);
    socket.off('connect_error', connectionError);
    if (socket.connected) socket.emit('room:leave', { roomId: payload.roomId });
  };
}
