const calculateDelays = (settings) => {
  if (settings.delayMode === 'fixed') {
    return {
      type: 'fixed',
      messageDelay: settings.minMessageDelay * 1000 // convert to ms
    };
  }
  
  if (settings.delayMode === 'random') {
    return {
      type: 'random',
      getDelay: () => {
        const min = settings.minMessageDelay * 1000;
        const max = settings.maxMessageDelay * 1000;
        return Math.random() * (max - min) + min; // ms
      }
    };
  }
  
  if (settings.delayMode === 'batch') {
    return {
      type: 'batch',
      batchSize: settings.batchSize,
      
      // Get batch delay
      getBatchDelay: () => {
        if (!settings.randomizeDelay) {
          return settings.batchDelay * 1000;
        }
        
        const min = settings.minBatchDelay * 1000;
        const max = settings.maxBatchDelay * 1000;
        return Math.random() * (max - min) + min;
      },
      
      // Get per-message delay within batch
      getMessageDelay: () => {
        if (!settings.randomizeDelay) {
          return settings.minMessageDelay * 1000;
        }
        
        const min = settings.minMessageDelay * 1000;
        const max = settings.maxMessageDelay * 1000;
        return Math.random() * (max - min) + min;
      },
      
      // Get batch size
      getBatchSize: () => {
        if (!settings.randomizeBatchSize) {
          return settings.batchSize;
        }
        
        const min = settings.minRandomBatchSize || 8;
        const max = settings.maxRandomBatchSize || 12;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
    };
  }
};

module.exports = { calculateDelays };
