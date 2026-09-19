require('dotenv').config();
const openwaService = require('./services/openwaService');

async function test() {
  console.log('Testing startSession...');
  const res = await openwaService.startSession('test-session-123');
  console.log('Result:', res);
}
test();
