// Permanent local purchases. Price is centralized; a subscription never grants
// these covers. The actual photo, attribution and license stay with each asset.
export const CITY_COVER_PRICE = 299;
export const PROFILE_CITY_CATALOG = Object.freeze({
  tokyo: Object.freeze({ author: 'Michael Day', license: 'CC BY 2.0', licenseURL: 'https://creativecommons.org/licenses/by/2.0/', source: 'https://commons.wikimedia.org/wiki/File:Shinjuku_in_the_Rain_(6969744906).jpg', location: 'Shinjuku, Tokyo', year: 2012 }),
  chongqing: Object.freeze({ author: 'Maple Doctor', license: 'CC BY-SA 4.0', licenseURL: 'https://creativecommons.org/licenses/by-sa/4.0/', source: 'https://commons.wikimedia.org/wiki/File:Chongqing_Skyline_At_Night.png', location: 'Hongyadong · Qiansimen Bridge, Chongqing', year: 2025 }),
  moscow: Object.freeze({ author: 'Jukov Nikita', license: 'CC BY 2.0', licenseURL: 'https://creativecommons.org/licenses/by/2.0/', source: 'https://commons.wikimedia.org/wiki/File:Moscow_City_at_night4.jpg', location: 'Moscow City', year: 2017 }),
  dubai: Object.freeze({ author: 'Robert Bock', license: 'CC0 1.0', licenseURL: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:Dubai_skyline_unsplash.jpg', location: 'Downtown Dubai · Business Bay', year: 2016 }),
});
export const CITY_PROFILE_COVERS = Object.freeze(Object.keys(PROFILE_CITY_CATALOG));
export const cityCoverOwned = (cover, owned = []) => CITY_PROFILE_COVERS.includes(cover) && Array.isArray(owned) && owned.includes(cover);
