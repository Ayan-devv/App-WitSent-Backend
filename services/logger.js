const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const log = (type, data) => {
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({
    timestamp,
    type, // 'signup', 'login', 'campaign', 'error', etc
    ...data
  }) + '\n';

  const fileName = `${type}.log`;
  fs.appendFileSync(path.join(logsDir, fileName), logEntry);
};

module.exports = { log };
