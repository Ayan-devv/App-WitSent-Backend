// Message Script Library for Internal WhatsApp Warmers
const SCRIPTS = {
  friendly: {
    initiations: [
      "Hey! 👋",
      "What's up?",
      "How are you doing?",
      "Long time! How's everything?",
      "Good to see you!",
      "Hi there! Hope you're well.",
      "Hey, how's it going?",
      "How have you been?",
      "Hope your day's going great!",
      "Hi! Got a minute to chat?"
    ],
    replies: [
      "Good, you?",
      "All good here! How about you?",
      "Same here, thanks! 😊",
      "Great, thanks for asking!",
      "Doing well! And you?",
      "Pretty good! Yourself?",
      "Not bad at all! Thanks.",
      "All well! 👍",
      "Doing fine, thanks!",
      "Yeah, good! You?"
    ]
  },
  business: {
    initiations: [
      "Hi",
      "Hope you're well.",
      "How's business going?",
      "Just checking in.",
      "Everything okay on your end?",
      "Good morning! Hope all is well.",
      "How's everything going?",
      "Quick check-in. All good?",
      "Hi, hope things are great!",
      "Checking in to see how you're doing."
    ],
    replies: [
      "Good, thanks!",
      "All good, cheers.",
      "Yes, everything's fine.",
      "Great, thanks for asking.",
      "Doing well, thank you.",
      "All well here.",
      "Everything's running smoothly.",
      "Good, appreciate you checking in.",
      "Fine, thanks!",
      "Things are going well."
    ]
  },
  casual: {
    initiations: [
      "Yo! 😄",
      "What's happening?",
      "You free?",
      "Up for a chat?",
      "Anything new?",
      "Hey man!",
      "Heyy! Wassup?",
      "What you up to?",
      "Hey! Been a while.",
      "Sup!"
    ],
    replies: [
      "Yeah, hey!",
      "Not much, you?",
      "All good, what about you?",
      "Always free!",
      "Same old, same old.",
      "Not much going on. You?",
      "Chilling! Yourself?",
      "All good! What's up?",
      "Nothing much! Hbu?",
      "Hey! Yeah, all good."
    ]
  }
};

/**
 * Get a random initiation message for the given style
 */
const getInitiationMessage = (style = 'friendly', usedMessages = []) => {
  const pool = SCRIPTS[style]?.initiations || SCRIPTS.friendly.initiations;
  const available = pool.filter(m => !usedMessages.includes(m));
  const source = available.length > 0 ? available : pool;
  return source[Math.floor(Math.random() * source.length)];
};

/**
 * Get a random reply message for the given style
 */
const getReplyMessage = (style = 'friendly', usedMessages = []) => {
  const pool = SCRIPTS[style]?.replies || SCRIPTS.friendly.replies;
  const available = pool.filter(m => !usedMessages.includes(m));
  const source = available.length > 0 ? available : pool;
  return source[Math.floor(Math.random() * source.length)];
};

/**
 * Get a random delay in milliseconds between min and max seconds
 */
const getRandomDelay = (minSec, maxSec) => {
  const sec = minSec + Math.random() * (maxSec - minSec);
  return Math.floor(sec * 1000);
};

module.exports = { getInitiationMessage, getReplyMessage, getRandomDelay, SCRIPTS };
