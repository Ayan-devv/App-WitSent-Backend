const randomizePromotions = (promotions, numbers) => {
  // Create mapping: number → random promotion
  const numberPromotionMap = new Map();
  
  // Fisher-Yates shuffle
  const shuffleArray = (arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };
  
  // Create randomized order of promotions for repeated use
  const randomizedPromos = shuffleArray(promotions);
  
  // Assign each number a random promotion
  numbers.forEach((number, index) => {
    const promotion = randomizedPromos[index % randomizedPromos.length];
    numberPromotionMap.set(number, promotion);
  });
  
  // Verify distribution
  const promoCount = new Map();
  numberPromotionMap.forEach((promo) => {
    promoCount.set(
      promo._id ? promo._id.toString() : promo.id,
      (promoCount.get(promo._id ? promo._id.toString() : promo.id) || 0) + 1
    );
  });
  
  return {
    numberPromotionMap,
    distribution: promoCount
  };
};

module.exports = { randomizePromotions };
