const socketLimits = {};

const limitSocketConnections = (socket) => {
  const userId = socket.handshake.query.userId || socket.id; // Fallback to socket id if not authed
  
  // Max 5 connections per user
  if (!socketLimits[userId]) {
    socketLimits[userId] = 0;
  }
  
  socketLimits[userId]++;
  
  if (socketLimits[userId] > 5) {
    socket.disconnect();
    console.warn(`❌ User ${userId} exceeded max connections`);
    return false;
  }
  
  // Cleanup on disconnect
  socket.on('disconnect', () => {
    if (socketLimits[userId] > 0) {
        socketLimits[userId]--;
    }
    if (socketLimits[userId] === 0) {
        delete socketLimits[userId];
    }
  });
  
  return true;
};

module.exports = { limitSocketConnections };
