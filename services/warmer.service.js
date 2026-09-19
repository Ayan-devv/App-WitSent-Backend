const InternalWarmer = require('../models/InternalWarmer');
const WarmerLog = require('../models/WarmerLog');
const WhatsAppSession = require('../models/WhatsAppSession');
const openwaService = require('./openwaService');
const { getInitiationMessage, getReplyMessage, getRandomDelay } = require('./warmerScripts');

const delay = ms => new Promise(res => setTimeout(res, ms));

// Map of warmerId -> boolean (true = running, false = stopped/paused)
const activeWarmers = new Map();

const isWarmerActive = (warmerId) => activeWarmers.get(warmerId.toString()) === true;

/**
 * Build all unique ordered pairs from accountIds
 * E.g., [A, B, C] → [(A,B), (A,C), (B,A), (B,C), (C,A), (C,B)]
 */
const buildPairs = (accountIds) => {
  const pairs = [];
  for (let i = 0; i < accountIds.length; i++) {
    for (let j = 0; j < accountIds.length; j++) {
      if (i !== j) {
        pairs.push([accountIds[i], accountIds[j]]);
      }
    }
  }
  return pairs;
};

/**
 * Shuffle an array (Fisher-Yates)
 */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Select a balanced sender/receiver pair based on account stats
 * Favors accounts with fewer sends as senders, fewer receives as receivers
 */
const selectBalancedPair = (accountIds, accountStats, lastPair) => {
  // Build candidate pairs, excluding same-as-last-sender as sender (for rotation)
  let candidates = buildPairs(accountIds);
  
  // Avoid same exact pair as last time
  if (lastPair) {
    candidates = candidates.filter(p => !(p[0] === lastPair[0] && p[1] === lastPair[1]));
    if (candidates.length === 0) candidates = buildPairs(accountIds);
  }

  // Shuffle for natural randomness
  const shuffled = shuffle(candidates);

  // Score: prefer senders with low sent count, receivers with low received count
  shuffled.sort((a, b) => {
    const scoreSendA = (accountStats[a[0]]?.sent || 0) - (accountStats[a[1]]?.received || 0);
    const scoreSendB = (accountStats[b[0]]?.sent || 0) - (accountStats[b[1]]?.received || 0);
    return scoreSendA - scoreSendB;
  });

  // Pick from top 3 randomly for variety
  const topCandidates = shuffled.slice(0, Math.min(3, shuffled.length));
  return topCandidates[Math.floor(Math.random() * topCandidates.length)];
};

/**
 * Main warmer execution engine
 */
const executeWarmer = async (warmerId) => {
  const warmerIdStr = warmerId.toString();
  
  try {
    const warmer = await InternalWarmer.findById(warmerId);
    if (!warmer || warmer.status === 'STOPPED' || warmer.status === 'COMPLETED') return;

    const io = openwaService.io;
    const durationMs = warmer.duration * 60 * 1000;
    const startTime = warmer.startedAt ? new Date(warmer.startedAt).getTime() : Date.now();

    await InternalWarmer.findByIdAndUpdate(warmerId, {
      status: 'RUNNING',
      startedAt: warmer.startedAt || new Date()
    });

    activeWarmers.set(warmerIdStr, true);

    // Initialize account stats tracker
    let accountStats = warmer.accountStats || {};
    for (const id of warmer.accountIds) {
      if (!accountStats[id]) {
        accountStats[id] = { sent: 0, received: 0, initiated: 0, replied: 0, failed: 0 };
      }
    }

    let totalConversations = warmer.totalConversations || 0;
    let totalSent = warmer.totalMessagesSent || 0;
    let totalFailed = warmer.totalMessagesFailed || 0;
    let lastPair = null;
    const recentMessages = {}; // per-pair message history for de-duplication

    console.log(`🔥 Warmer ${warmerIdStr} started with ${warmer.accountIds.length} accounts`);

    // Main loop
    while (isWarmerActive(warmerIdStr)) {
      const elapsed = Date.now() - startTime;
      
      if (elapsed >= durationMs) {
        console.log(`✅ Warmer ${warmerIdStr} duration complete`);
        break;
      }

      // Fetch all active sessions
      const sessions = await WhatsAppSession.find({
        _id: { $in: warmer.accountIds },
        isConnected: true
      });

      const activeAccountIds = sessions.map(s => s._id.toString());

      if (activeAccountIds.length < 2) {
        console.log(`⚠️ Warmer ${warmerIdStr}: Less than 2 active accounts, waiting 10s...`);
        if (io) {
          io.to(`user-${warmer.userId}`).emit('warmer-progress', {
            warmerId: warmerIdStr,
            elapsed: Math.floor(elapsed / 60000),
            remaining: Math.floor((durationMs - elapsed) / 60000),
            progressPercent: Math.min(100, Math.floor((elapsed / durationMs) * 100)),
            totalConversations,
            messagesSent: totalSent,
            messagesFailed: totalFailed,
            successRate: totalSent > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : 100,
            warning: 'Less than 2 accounts connected'
          });
        }
        await delay(10000);
        continue;
      }

      // Select a balanced pair
      const selectedPair = selectBalancedPair(activeAccountIds, accountStats, lastPair);
      const [senderSessionId, receiverSessionId] = selectedPair;
      lastPair = selectedPair;

      const senderSession = sessions.find(s => s._id.toString() === senderSessionId);
      const receiverSession = sessions.find(s => s._id.toString() === receiverSessionId);

      if (!senderSession || !receiverSession) {
        await delay(2000);
        continue;
      }

      // Verify both clients are actually in CONNECTED state
      const senderStateRes = await openwaService.getSessionStatus(senderSessionId);
      const receiverStateRes = await openwaService.getSessionStatus(receiverSessionId);

      if (!senderStateRes.success || !['CONNECTED', 'connected', 'ready', 'READY'].includes(senderStateRes.status) || !receiverStateRes.success || !['CONNECTED', 'connected', 'ready', 'READY'].includes(receiverStateRes.status)) {
        console.log(`⚠️ Warmer: client state not CONNECTED, waiting 15s...`);
        await delay(15000);
        continue;
      }

      // Get message history for this pair to avoid repeats
      const pairKey = `${senderSessionId}-${receiverSessionId}`;
      const usedInitiations = recentMessages[pairKey] || [];
      const initiationMsg = getInitiationMessage(warmer.conversationStyle, usedInitiations);
      
      if (!recentMessages[pairKey]) recentMessages[pairKey] = [];
      recentMessages[pairKey].push(initiationMsg);
      if (recentMessages[pairKey].length > 5) recentMessages[pairKey].shift(); // keep last 5

      const receiverPhone = receiverSession.phoneNumber;
      const senderPhone = senderSession.phoneNumber;
      const senderName = senderSession.displayName || senderPhone;
      const receiverName = receiverSession.displayName || receiverPhone;

      // Emit current activity
      if (io) {
        io.to(`user-${warmer.userId}`).emit('warmer-activity', {
          warmerId: warmerIdStr,
          type: 'INITIATING',
          sender: { name: senderName, phone: senderPhone },
          receiver: { name: receiverName, phone: receiverPhone },
          message: initiationMsg
        });
      }

      // STEP 1: Send initiation message
      let sendSuccess = false;
      try {
        const formattedNumber = `${receiverPhone.replace(/\D/g, '')}@c.us`;
        const result = await openwaService.sendMessage(senderSessionId, formattedNumber, initiationMsg);
        
        if (!result.success) throw new Error(result.error || 'Failed to send message via OpenWA');
        
        sendSuccess = true;
        totalSent++;
        totalConversations++;
        accountStats[senderSessionId].sent = (accountStats[senderSessionId].sent || 0) + 1;
        accountStats[senderSessionId].initiated = (accountStats[senderSessionId].initiated || 0) + 1;
        accountStats[receiverSessionId].received = (accountStats[receiverSessionId].received || 0) + 1;

        await WarmerLog.create({
          warmerId,
          senderSessionId,
          receiverSessionId,
          senderPhone,
          receiverPhone,
          senderName,
          receiverName,
          message: initiationMsg,
          messageType: 'INITIATION',
          status: 'SENT',
          sentAt: new Date()
        });

        console.log(`💬 [${senderName}] → [${receiverName}]: "${initiationMsg}"`);
      } catch (err) {
        console.error(`❌ Send failed: ${senderName} → ${receiverName}:`, err.message);
        totalFailed++;
        accountStats[senderSessionId].failed = (accountStats[senderSessionId].failed || 0) + 1;

        await WarmerLog.create({
          warmerId,
          senderSessionId,
          receiverSessionId,
          senderPhone,
          receiverPhone,
          senderName,
          receiverName,
          message: initiationMsg,
          messageType: 'INITIATION',
          status: 'FAILED',
          error: err.message,
          sentAt: new Date()
        });
      }

      // Save progress
      await InternalWarmer.findByIdAndUpdate(warmerId, {
        totalConversations,
        totalMessagesSent: totalSent,
        totalMessagesFailed: totalFailed,
        accountStats
      });

      // Emit progress update
      const elapsed2 = Date.now() - startTime;
      if (io) {
        io.to(`user-${warmer.userId}`).emit('warmer-progress', {
          warmerId: warmerIdStr,
          elapsed: Math.floor(elapsed2 / 60000),
          remaining: Math.floor(Math.max(0, durationMs - elapsed2) / 60000),
          progressPercent: Math.min(100, Math.floor((elapsed2 / durationMs) * 100)),
          totalConversations,
          messagesSent: totalSent,
          messagesFailed: totalFailed,
          successRate: totalSent > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : 100,
          accountStats,
          currentActivity: {
            sender: senderName,
            receiver: receiverName,
            message: initiationMsg,
            type: 'INITIATION'
          }
        });
      }

      if (!sendSuccess) {
        // Skip reply if initiation failed
        const skipDelay = getRandomDelay(warmer.minMessageDelay, warmer.maxMessageDelay);
        await delay(skipDelay);
        continue;
      }

      // STEP 2: Wait for reply delay (simulate reading time)
      const replyWait = getRandomDelay(warmer.replyDelayMin, warmer.replyDelayMax);
      await delay(replyWait);

      if (!isWarmerActive(warmerIdStr)) break;

      // STEP 3: Send auto-reply from receiver back to sender
      const replyPairKey = `${receiverSessionId}-${senderSessionId}`;
      const usedReplies = recentMessages[replyPairKey] || [];
      const replyMsg = getReplyMessage(warmer.conversationStyle, usedReplies);

      if (!recentMessages[replyPairKey]) recentMessages[replyPairKey] = [];
      recentMessages[replyPairKey].push(replyMsg);
      if (recentMessages[replyPairKey].length > 5) recentMessages[replyPairKey].shift();

      try {
        const formattedSenderNumber = `${senderPhone.replace(/\D/g, '')}@c.us`;
        const replyResult = await openwaService.sendMessage(receiverSessionId, formattedSenderNumber, replyMsg);
        if (!replyResult.success) throw new Error(replyResult.error || 'Failed to send reply via OpenWA');
        totalSent++;
        accountStats[receiverSessionId].sent = (accountStats[receiverSessionId].sent || 0) + 1;
        accountStats[receiverSessionId].replied = (accountStats[receiverSessionId].replied || 0) + 1;
        accountStats[senderSessionId].received = (accountStats[senderSessionId].received || 0) + 1;

        await WarmerLog.create({
          warmerId,
          senderSessionId: receiverSessionId,
          receiverSessionId: senderSessionId,
          senderPhone: receiverPhone,
          receiverPhone: senderPhone,
          senderName: receiverName,
          receiverName: senderName,
          message: replyMsg,
          messageType: 'REPLY',
          status: 'SENT',
          replyDelayMs: replyWait,
          sentAt: new Date()
        });

        console.log(`↩️ [${receiverName}] replies to [${senderName}]: "${replyMsg}"`);

        if (io) {
          io.to(`user-${warmer.userId}`).emit('warmer-activity', {
            warmerId: warmerIdStr,
            type: 'REPLY',
            sender: { name: receiverName, phone: receiverPhone },
            receiver: { name: senderName, phone: senderPhone },
            message: replyMsg
          });
        }
      } catch (err) {
        console.error(`❌ Reply failed:`, err.message);
        totalFailed++;
        accountStats[receiverSessionId].failed = (accountStats[receiverSessionId].failed || 0) + 1;
      }

      // Save updated stats
      await InternalWarmer.findByIdAndUpdate(warmerId, {
        totalMessagesSent: totalSent,
        totalMessagesFailed: totalFailed,
        accountStats
      });

      // Wait before next conversation cycle
      const nextCycleDelay = getRandomDelay(warmer.minMessageDelay, warmer.maxMessageDelay);
      await delay(nextCycleDelay);
    }

    // Warmer loop exited — check reason
    const finalWarmer = await InternalWarmer.findById(warmerId);
    if (finalWarmer && finalWarmer.status === 'RUNNING') {
      // Duration expired, mark completed
      const totalProcessed = totalSent + totalFailed;
      const finalSuccessRate = totalProcessed > 0 ? (totalSent / totalProcessed) * 100 : 100;

      await InternalWarmer.findByIdAndUpdate(warmerId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        totalMessagesSent: totalSent,
        totalMessagesFailed: totalFailed,
        totalConversations,
        successRate: finalSuccessRate,
        accountStats
      });

      console.log(`🏁 Warmer ${warmerIdStr} COMPLETED: ${totalSent} messages sent, ${totalConversations} conversations`);

      if (io) {
        io.to(`user-${warmer.userId}`).emit('warmer-completed', {
          warmerId: warmerIdStr,
          totalConversations,
          messagesSent: totalSent,
          messagesFailed: totalFailed,
          successRate: finalSuccessRate.toFixed(1),
          accountStats
        });
      }
    }

    activeWarmers.delete(warmerIdStr);
  } catch (err) {
    console.error(`💥 Warmer ${warmerIdStr} execution error:`, err);
    await InternalWarmer.findByIdAndUpdate(warmerId, { status: 'FAILED' });
    activeWarmers.delete(warmerIdStr);
  }
};

/**
 * Pause a running warmer
 */
const pauseWarmer = async (warmerId) => {
  activeWarmers.set(warmerId.toString(), false);
  await InternalWarmer.findByIdAndUpdate(warmerId, {
    status: 'PAUSED',
    pausedAt: new Date()
  });
};

/**
 * Resume a paused warmer
 */
const resumeWarmer = async (warmerId) => {
  await InternalWarmer.findByIdAndUpdate(warmerId, {
    status: 'RUNNING',
    pausedAt: null
  });
  executeWarmer(warmerId);
};

/**
 * Stop a warmer permanently
 */
const stopWarmer = async (warmerId) => {
  activeWarmers.set(warmerId.toString(), false);
  await InternalWarmer.findByIdAndUpdate(warmerId, {
    status: 'STOPPED',
    completedAt: new Date()
  });
};

module.exports = {
  executeWarmer,
  pauseWarmer,
  resumeWarmer,
  stopWarmer,
  isWarmerActive
};
