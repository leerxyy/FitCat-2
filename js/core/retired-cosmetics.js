// Receipt compatibility only. These items are absent from every active catalog
// and cannot be purchased or selected. Never rewrite an existing coin ledger.
export const RETIRED_FRAME_PRICES = Object.freeze({ dragon:229, chronos:229, eclipse:229, frostcrown:229, phoenix:229, kitsune:9999, pearlguard:9999, seraph:9999 });
export const RETIRED_COVER_PRICES = Object.freeze({ scarlet:9999, atlantis:9999, cathedral:9999 });
const names = {
  ru:{dragon:'Небесный дракон',chronos:'Хронос',eclipse:'Затмение',frostcrown:'Ледяная корона',phoenix:'Феникс',kitsune:'Кицунэ',pearlguard:'Жемчужный страж',seraph:'Серафим',scarlet:'Алый храм',atlantis:'Атлантида',cathedral:'Небесный собор'},
  en:{dragon:'Celestial Dragon',chronos:'Chronos',eclipse:'Eclipse',frostcrown:'Frost Crown',phoenix:'Phoenix',kitsune:'Kitsune',pearlguard:'Pearl Guardian',seraph:'Seraph',scarlet:'Scarlet Temple',atlantis:'Atlantis',cathedral:'Celestial Cathedral'},
  cn:{dragon:'天龙',chronos:'时序',eclipse:'日蚀',frostcrown:'冰冠',phoenix:'凤凰',kitsune:'灵狐',pearlguard:'珍珠守卫',seraph:'炽天使',scarlet:'绯红神社',atlantis:'亚特兰蒂斯',cathedral:'天空圣殿'},
};
export const retiredCosmeticName = (id, language='ru') => names[language]?.[id] || names.en[id] || id;
