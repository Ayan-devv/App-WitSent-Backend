const io = require('socket.io-client');
const socket = io('http://localhost:5000');
socket.on('connect', () => {
  console.log('Connected!');
  socket.emit('start-whatsapp', { token: 'invalid_token', sessionId: 'fake_session' });
  setTimeout(() => process.exit(0), 1000);
});
