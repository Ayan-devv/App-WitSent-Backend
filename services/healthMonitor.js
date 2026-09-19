const axios = require('axios');
const EventEmitter = require('events');

class HealthMonitor extends EventEmitter {
  constructor() {
    super();
    this.isOnline = true;
    this.checkInterval = 30000; // Check every 30 seconds
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => {
      this.checkConnection();
    }, this.checkInterval);
  }

  async checkConnection() {
    try {
      const healthChecks = [
        this.pingGoogle(),
        this.pingCloudflare()
      ];

      const results = await Promise.race(healthChecks);
      
      if (!this.isOnline && results) {
        console.log('✅ Internet connection restored');
        this.isOnline = true;
        this.emit('online');
      }
    } catch (err) {
      if (this.isOnline) {
        console.error('❌ Internet connection lost');
        this.isOnline = false;
        this.emit('offline');
      }
    }
  }

  async pingGoogle() {
    return new Promise((resolve, reject) => {
      axios.get('https://www.google.com', { timeout: 5000 })
        .then(() => resolve(true))
        .catch(() => reject(false));
    });
  }

  async pingCloudflare() {
    return new Promise((resolve, reject) => {
      axios.get('https://1.1.1.1', { timeout: 5000 })
        .then(() => resolve(true))
        .catch(() => reject(false));
    });
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      lastCheck: new Date(),
      checkInterval: this.checkInterval
    };
  }
}

module.exports = new HealthMonitor();
