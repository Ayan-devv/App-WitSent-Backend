const axios = require('axios');

class OpenWAService {
  constructor() {
    this.baseUrl = process.env.OPENWA_API_URL || 'https://wa.witsent.online/api';
    this.apiKey = process.env.OPENWA_API_KEY || 'owa_k1_c45c229c0b953c75ff494d69338764881888534f3e3039a4f044e513babd943f';
    this.api = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30s timeout for slow engine starts
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'X-API-Key': this.apiKey })
      }
    });
    // Cache: mongoId -> openwaUUID
    this._idCache = {};
  }

  /**
   * Helper to get OpenWA UUID from MongoDB ObjectId.
   * Caches the result so we don't hit /sessions on every poll tick.
   */
  async getOpenwaId(sessionId) {
    if (this._idCache[sessionId]) return this._idCache[sessionId];

    const name = `session-${sessionId}`;
    const res = await this.api.get('/sessions');
    const session = res.data.find(s => s.name === name);
    if (session) {
      this._idCache[sessionId] = session.id;
      return session.id;
    }

    // Create if not exists
    try {
      const createRes = await this.api.post('/sessions', { name });
      this._idCache[sessionId] = createRes.data.id;
      return createRes.data.id;
    } catch (err) {
      if (err.response?.status === 409) {
        const retryRes = await this.api.get('/sessions');
        const found = retryRes.data.find(s => s.name === name);
        if (found) {
          this._idCache[sessionId] = found.id;
          return found.id;
        }
      }
      throw err;
    }
  }

  _extractErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') return data;
      if (data.message) {
        return typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
      }
      if (data.error) {
        return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      }
      return JSON.stringify(data);
    }
    return error.message || String(error);
  }

  /**
   * Start a session in OpenWA
   */
  async startSession(sessionId) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      if (!openwaId) throw new Error('Could not resolve openwaId');
      console.log(`[OpenWA] Starting session ${sessionId} -> openwaId ${openwaId}`);

      const res = await this.api.post(`/sessions/${openwaId}/start`);
      console.log(`[OpenWA] Start result: status=${res.data.status}`);
      return { success: true, data: res.data };
    } catch (error) {
      // 400 "Session already started" is fine
      if (error?.response?.status === 400 && error?.response?.data?.message?.includes?.('already')) {
        console.log(`[OpenWA] Session ${sessionId} already started, continuing...`);
        return { success: true, data: { status: 'already_started' } };
      }
      const errMsg = this._extractErrorMessage(error);
      console.error(`[OpenWA] Failed to start session ${sessionId}:`, errMsg);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Ensure session is active and ready to send messages.
   * If session was stopped/disconnected, attempts to auto-start and wait for ready state.
   */
  async ensureSessionActive(sessionId, maxWaitMs = 8000) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      if (!openwaId) return { success: false, error: 'Could not resolve session' };

      // 1. Check current status
      const statusRes = await this.getSessionStatus(sessionId);
      if (statusRes.success) {
        const curStatus = (statusRes.status || '').toLowerCase();
        if (['ready', 'connected'].includes(curStatus)) {
          return { success: true, status: statusRes.status, session: statusRes.session };
        }
      }

      // 2. If disconnected or not loaded, start the session
      console.log(`[OpenWA] Session ${sessionId} is inactive (status=${statusRes.status}). Attempting auto-recovery start...`);
      await this.startSession(sessionId);

      // 3. Poll for ready state
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await this.getSessionStatus(sessionId);
        if (check.success) {
          const s = (check.status || '').toLowerCase();
          if (['ready', 'connected'].includes(s)) {
            console.log(`[OpenWA] Session ${sessionId} successfully auto-healed to ${check.status}!`);
            return { success: true, status: check.status, session: check.session };
          }
          if (s === 'qr_ready') {
            console.log(`[OpenWA] Session ${sessionId} requires QR scan (not authenticated).`);
            return { success: false, status: 'needs_qr', error: 'WhatsApp session requires QR authentication' };
          }
        }
      }

      const finalCheck = await this.getSessionStatus(sessionId);
      const isOk = finalCheck.success && ['ready', 'connected'].includes((finalCheck.status || '').toLowerCase());
      return { 
        success: isOk, 
        status: finalCheck.status || 'unknown',
        error: isOk ? null : `Session did not reach ready state within ${maxWaitMs}ms (current: ${finalCheck.status})` 
      };
    } catch (err) {
      console.error(`[OpenWA] ensureSessionActive error for ${sessionId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get QR code for the session
   */
  async getQRCode(sessionId) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      const res = await this.api.get(`/sessions/${openwaId}/qr`);
      // OpenWA returns { qrCode: "data:image/png;base64,..." }
      const qrData = res.data.qrCode || res.data.qr || res.data;
      return { success: true, qr: qrData };
    } catch (error) {
      return { success: false, error: this._extractErrorMessage(error) };
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      const res = await this.api.get(`/sessions/${openwaId}`);
      return { success: true, status: res.data.status, session: res.data };
    } catch (error) {
      return { success: false, error: this._extractErrorMessage(error) };
    }
  }

  /**
   * Stop session (disconnects temporarily)
   */
  async stopSession(sessionId) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      await this.api.post(`/sessions/${openwaId}/stop`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.response?.data || error.message };
    }
  }

  /**
   * Logout (unlinks device permanently)
   */
  async disconnectSession(sessionId) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      await this.api.post(`/sessions/${openwaId}/logout`);
      await this.api.delete(`/sessions/${openwaId}`).catch(() => {});
      delete this._idCache[sessionId];
      return { success: true };
    } catch (error) {
      console.error(`[OpenWA] Disconnect error for ${sessionId}:`, error?.response?.data || error.message);
      return { success: false, error: error?.response?.data || error.message };
    }
  }

  /**
   * Delete session completely
   */
  async deleteSession(sessionId) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      if (openwaId) {
        await this.api.delete(`/sessions/${openwaId}`);
        delete this._idCache[sessionId];
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error?.response?.data || error.message };
    }
  }

  // --- SOCKET HANDLING ---

  setupWhatsAppSocket(io) {
    this.io = io;
    io.on('connection', (socket) => {
      console.log('[Socket] Client connected:', socket.id);
      let currentSessionId = null;
      let checkInterval = null;

      socket.on('join-room', (userId) => {
        socket.join(`user-${userId}`);
      });

      socket.on('start-whatsapp', async (data) => {
        try {
          console.log('[Socket] start-whatsapp received:', { sessionId: data.sessionId, hasToken: !!data.token });
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
          const userId = decoded.id;
          const sessionId = data.sessionId;
          currentSessionId = sessionId;

          // 1. Start the engine
          console.log('[Socket] Step 1: Starting OpenWA session...');
          const startRes = await this.startSession(sessionId);
          console.log('[Socket] Step 1 result:', startRes.success ? 'OK' : startRes.error);

          if (!startRes.success) {
            socket.emit('error', 'Failed to start WhatsApp engine. Please try again.');
            return;
          }

          // 2. Poll for QR and status
          console.log('[Socket] Step 2: Starting QR poll...');
          let qrTries = 0;
          checkInterval = setInterval(async () => {
            try {
              qrTries++;
              
              // Check status first
              const statusRes = await this.getSessionStatus(sessionId);
              console.log(`[Socket] Poll #${qrTries}: status=${statusRes.status || 'unknown'}`);

              if (statusRes.success) {
                const status = statusRes.status;

                if (status === 'connected' || status === 'CONNECTED' || status === 'ready' || status === 'READY') {
                  clearInterval(checkInterval);
                  checkInterval = null;
                  console.log('[Socket] Session connected!');
                  const WhatsAppSession = require('../models/WhatsAppSession');
                  const phone = statusRes.session?.phone || 'Unknown';
                  
                  // Clean up any older session with the exact same phone number for this user
                  if (phone !== 'Unknown') {
                    await WhatsAppSession.deleteMany({
                      userId,
                      phoneNumber: phone,
                      _id: { $ne: sessionId }
                    });
                  }

                  await WhatsAppSession.findByIdAndUpdate(sessionId, {
                    isConnected: true,
                    status: 'CONNECTED',
                    phoneNumber: phone,
                    displayName: statusRes.session?.pushName || 'WhatsApp User'
                  });
                  socket.emit('connected', { 
                    number: phone, 
                    pushname: statusRes.session?.pushName,
                    sessionId 
                  });
                  return;
                }
              }

              // If not connected, try fetching QR
              const qrRes = await this.getQRCode(sessionId);
              if (qrRes.success && qrRes.qr) {
                // Ensure we have a string — either a data:image URI or a raw QR text value
                let qrString;
                if (typeof qrRes.qr === 'string') {
                  qrString = qrRes.qr;
                } else if (typeof qrRes.qr === 'object') {
                  qrString = qrRes.qr.qrCode || qrRes.qr.qr || qrRes.qr.base64 || JSON.stringify(qrRes.qr);
                } else {
                  qrString = String(qrRes.qr);
                }
                console.log(`[Socket] Poll #${qrTries}: QR received (type=${typeof qrRes.qr}, first50=${qrString.substring(0, 50)})`);
                socket.emit('qr-code', { qr: qrString, sessionId });
              } else {
                console.log(`[Socket] Poll #${qrTries}: No QR yet - ${qrRes.error?.message || 'waiting...'}`);
              }

              if (qrTries > 60) {
                clearInterval(checkInterval);
                checkInterval = null;
                socket.emit('error', 'QR Code timeout. Please try again.');
              }
            } catch (pollErr) {
              console.error(`[Socket] Poll error:`, pollErr.message);
            }
          }, 2000);

        } catch (error) {
          console.error('[Socket] start-whatsapp error:', error.message);
          socket.emit('error', 'Authentication failed or session error');
        }
      });

      socket.on('disconnect', () => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
      });
    });
  }

  // --- MESSAGING ---

  /**
   * Send a text message with auto-healing
   */
  async sendMessage(sessionId, phone, message, isRetry = false) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
      const res = await this.api.post(`/sessions/${openwaId}/messages/send-text`, {
        chatId,
        text: message
      });
      return { success: true, data: res.data };
    } catch (error) {
      const errMsg = this._extractErrorMessage(error);
      console.error(`[OpenWA] Failed to send message to ${phone}:`, errMsg);

      // Auto-heal if session was inactive/stopped
      if (!isRetry && (errMsg.includes('not active') || errMsg.includes('Start the session first') || error?.response?.status === 400)) {
        console.log(`[OpenWA] Session ${sessionId} inactive during send. Auto-healing...`);
        const healRes = await this.ensureSessionActive(sessionId);
        if (healRes.success) {
          console.log(`[OpenWA] Auto-heal succeeded! Retrying message send to ${phone}...`);
          return this.sendMessage(sessionId, phone, message, true);
        }
      }

      return { success: false, error: errMsg };
    }
  }

  /**
   * Send media message (image/video/document) with auto-healing
   */
  async sendMessageWithMedia(sessionId, phone, text, mediaPath, mediaType = 'image', isRetry = false) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
      const fs = require('fs');
      const base64Data = fs.readFileSync(mediaPath, { encoding: 'base64' });
      const endpoint = `/sessions/${openwaId}/messages/send-${mediaType}`;
      const res = await this.api.post(endpoint, {
        chatId,
        base64: base64Data,
        caption: text,
      });
      return { success: true, data: res.data };
    } catch (error) {
      const errMsg = this._extractErrorMessage(error);
      console.error(`[OpenWA] Failed to send media to ${phone}:`, errMsg);

      // Auto-heal if session was inactive/stopped
      if (!isRetry && (errMsg.includes('not active') || errMsg.includes('Start the session first') || error?.response?.status === 400)) {
        console.log(`[OpenWA] Session ${sessionId} inactive during media send. Auto-healing...`);
        const healRes = await this.ensureSessionActive(sessionId);
        if (healRes.success) {
          console.log(`[OpenWA] Auto-heal succeeded! Retrying media send to ${phone}...`);
          return this.sendMessageWithMedia(sessionId, phone, text, mediaPath, mediaType, true);
        }
      }

      return { success: false, error: errMsg };
    }
  }

  /**
   * Send bulk messages
   */
  async sendBulkMessages(sessionId, messages) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      const formattedMessages = messages.map(msg => ({
        type: 'text',
        chatId: msg.phone.includes('@') ? msg.phone : `${msg.phone}@c.us`,
        text: msg.message
      }));

      const res = await this.api.post(`/sessions/${openwaId}/messages/send-bulk`, {
        messages: formattedMessages,
        options: {
          delayBetweenMessages: 3000
        }
      });
      return { success: true, batchId: res.data.batchId };
    } catch (error) {
      console.error(`[OpenWA] Failed bulk send:`, error?.response?.data || error.message);
      return { success: false, error: error?.response?.data || error.message };
    }
  }

  /**
   * Get batch status
   */
  async getBatchStatus(sessionId, batchId) {
    try {
      const openwaId = await this.getOpenwaId(sessionId);
      const res = await this.api.get(`/sessions/${openwaId}/messages/batch/${batchId}`);
      return { success: true, data: res.data };
    } catch (error) {
      return { success: false, error: error?.response?.data || error.message };
    }
  }
}

module.exports = new OpenWAService();
