const fs = require('fs');
const path = require('path');

const suspiciousActivity = {};

const monitorDDoS = (req) => {
  const key = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!suspiciousActivity[key]) {
    suspiciousActivity[key] = [];
  }
  
  // Keep only last 60 seconds
  suspiciousActivity[key] = suspiciousActivity[key].filter(
    time => now - time < 60000
  );
  
  suspiciousActivity[key].push(now);
  
  const requestsPerMinute = suspiciousActivity[key].length;
  
  const threshold = parseInt(process.env.DDOS_ALERT_THRESHOLD) || 100;

  // Alert if > threshold requests per minute
  if (requestsPerMinute > threshold) {
    console.error(`🚨 DDOS ALERT: ${key} made ${requestsPerMinute} requests in 1 min`);
    
    // Log to file
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    
    fs.appendFileSync(
      path.join(logDir, 'ddos-alerts.log'),
      `${new Date().toISOString()} - IP: ${key} - Requests: ${requestsPerMinute}\n`
    );
    
    // Return true to indicate suspicious if block is enabled
    if (process.env.BLOCK_SUSPICIOUS_IPS === 'true') {
        return true;
    }
  }
  
  return false;
};

const getDDoSStats = () => {
    const stats = {
        suspiciousIPs: [],
        blockedIPs: []
    };
    
    const threshold = parseInt(process.env.DDOS_ALERT_THRESHOLD) || 100;
    const now = Date.now();

    for (const [ip, timestamps] of Object.entries(suspiciousActivity)) {
        const recentRequests = timestamps.filter(time => now - time < 60000).length;
        if (recentRequests > 0) {
            const blocked = recentRequests > threshold && process.env.BLOCK_SUSPICIOUS_IPS === 'true';
            stats.suspiciousIPs.push({ ip, requests: recentRequests, blocked });
            if (blocked) stats.blockedIPs.push(ip);
        }
    }
    
    return stats;
};

module.exports = { monitorDDoS, getDDoSStats };
