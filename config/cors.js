const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true); // Allow all origins dynamically (supports LAN IPs with credentials)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

module.exports = cors(corsOptions);
