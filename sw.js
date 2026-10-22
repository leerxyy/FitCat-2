// Bump VERSION after editing any file in APP_FILES, then deploy the whole folder.
const VERSION = '3.31.0-r2';
const PREFIX = `fitcat-${encodeURIComponent(self.registration.scope)}-`;
const CACHE = PREFIX + VERSION;
const ROOT = self.registration.scope;
const APP_FILES = [
  "./",
  "assets/audio/tap.wav",
  "assets/backgrounds/aurora-thumb.webp",
  "assets/backgrounds/aurora.webp",
  "assets/backgrounds/coast-thumb.webp",
  "assets/backgrounds/coast.webp",
  "assets/backgrounds/cosmos-thumb.webp",
  "assets/backgrounds/cosmos.webp",
  "assets/backgrounds/dunes-thumb.webp",
  "assets/backgrounds/dunes.webp",
  "assets/backgrounds/forest-thumb.webp",
  "assets/backgrounds/forest.webp",
  "assets/backgrounds/glacier-thumb.webp",
  "assets/backgrounds/glacier.webp",
  "assets/backgrounds/mountains-thumb.webp",
  "assets/backgrounds/mountains.webp",
  "assets/effects/aurora-light.svg",
  "assets/effects/iridescence.svg",
  "assets/effects/waves.svg",
  "assets/icons/app-icon-192.png",
  "assets/icons/app-icon-512.png",
  "assets/icons/app-icon.svg",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/developer.svg",
  "assets/icons/logo.svg",
  "assets/icons/maskable-icon-512.png",
  "assets/icons/plus-ribbon.svg",
  "assets/icons/sprite.svg",
  "assets/profile-covers/aurora-thumb.webp",
  "assets/profile-covers/aurora.webp",
  "assets/profile-covers/cosmos-thumb.webp",
  "assets/profile-covers/cosmos.webp",
  "assets/profile-covers/dunes-thumb.webp",
  "assets/profile-covers/dunes.webp",
  "assets/profile-covers/forest-thumb.webp",
  "assets/profile-covers/forest.webp",
  "assets/profile-covers/lake-thumb.webp",
  "assets/profile-covers/lake.webp",
  "assets/profile-covers/mist-thumb.webp",
  "assets/profile-covers/mist.webp",
  "assets/profile-covers/ocean-thumb.webp",
  "assets/profile-covers/ocean.webp",
  "assets/profile-covers/summits-thumb.webp",
  "assets/profile-covers/summits.webp",
  "assets/profile-effects/aurora-far.svg",
  "assets/profile-effects/aurora.svg",
  "assets/profile-effects/cosmos.svg",
  "assets/profile-effects/mist-far.svg",
  "assets/profile-effects/mist.svg",
  "assets/profile-effects/stars-2.svg",
  "assets/profile-effects/stars-3.svg",
  "assets/profile-effects/stars-4.svg",
  "assets/profile-effects/stars.svg",
  "index.html",
  "js/app.js",
  "js/core/access.js",
  "js/core/activity-copy.js",
  "js/core/appearance-copy.js",
  "js/core/appearance-tones.js",
  "js/core/appearance.js",
  "js/core/asset-url.js",
  "js/core/developer.js",
  "js/core/friends-copy.js",
  "js/core/gesture-copy.js",
  "js/core/gesture-tracker.js",
  "js/core/i18n.js",
  "js/core/loader.js",
  "js/core/math.js",
  "js/core/photo-crop.js",
  "js/core/premium-copy.js",
  "js/core/profile-copy.js",
  "js/core/profile-style-copy.js",
  "js/core/profile-style.js",
  "js/core/selection-motion.js",
  "js/core/settings-copy.js",
  "js/core/sounds.js",
  "js/core/statistics-copy.js",
  "js/core/store.js",
  "js/core/subscription-copy.js",
  "js/core/subscription.js",
  "js/core/tilt.js",
  "js/core/translations.js",
  "js/core/video-inference.js",
  "js/core/weather-copy.js",
  "js/core/weather.js",
  "js/features/analytics.js",
  "js/features/appearance.js",
  "js/features/audio-settings.js",
  "js/features/developer.js",
  "js/features/diary.js",
  "js/features/gestures.js",
  "js/features/preferences.js",
  "js/features/products.js",
  "js/features/profile-style.js",
  "js/features/profile.js",
  "js/features/subscription.js",
  "js/features/weather.js",
  "js/services/friends.js",
  "js/services/weather.js",
  "js/ui/ambient.js",
  "js/ui/boot.js",
  "js/ui/components.js",
  "js/ui/cosmetic-timeline.js",
  "js/ui/decorations.js",
  "js/ui/dock.js",
  "js/ui/haptics.js",
  "js/ui/motion.js",
  "js/ui/nav-lens.js",
  "js/ui/navigation.js",
  "js/ui/orientation.js",
  "js/ui/performance.js",
  "js/ui/photo-editor.js",
  "js/ui/plus-ribbon.js",
  "js/ui/premium.js",
  "js/ui/profile-swipe.js",
  "js/ui/pwa.js",
  "js/ui/selection-lens.js",
  "js/ui/sheets.js",
  "js/ui/sounds.js",
  "js/ui/surfaces.js",
  "js/ui/viewport.js",
  "manifest.webmanifest",
  "styles/activity.css",
  "styles/appearance-backgrounds.css",
  "styles/appearance-palette.css",
  "styles/appearance.css",
  "styles/base.css",
  "styles/components.css",
  "styles/friends.css",
  "styles/glass.css",
  "styles/interactions.css",
  "styles/layout.css",
  "styles/motion.css",
  "styles/performance.css",
  "styles/photo-crop.css",
  "styles/premium.css",
  "styles/profile-style.css",
  "styles/profile.css",
  "styles/refinement.css",
  "styles/selection-lens.css",
  "styles/settings.css",
  "styles/smart-water.css",
  "styles/startup.css",
  "styles/statistics.css",
  "styles/subscription.css",
  "styles/today.css",
  "styles/tokens.css"
];
// BEGIN ASSET HASHES — regenerate with python3 tools/generate_precache_hashes.py
const ASSET_HASHES = {
  "./": "fdced62d93ff515ab7fe4cf1a40e86e603887fe1209b7b119a1327659ec9f378",
  "assets/audio/tap.wav": "41e904fecba409c07c41520b437e2f6340f8beb15ed00614ef0b43575eadad02",
  "assets/backgrounds/aurora-thumb.webp": "7b7085aeedaa779039e7c78fc09f28b4785c8f07db90329c8e404c214b00b1d4",
  "assets/backgrounds/aurora.webp": "2cbad7d99cac986e3c6fea3575141f08ffe664ab4c99bfbfc1e9c3b52ec46c17",
  "assets/backgrounds/coast-thumb.webp": "5ae578e449119c5d85e5e1f92f2b9268b87bb635207494105c66839c3c3f00df",
  "assets/backgrounds/coast.webp": "95d4dceef5d9d1bbcdcf837d9f005bc1a33aa2575139782aab52bdd80e36e54f",
  "assets/backgrounds/cosmos-thumb.webp": "5368a51d56b4fb09e06c38b8351d52557abe19e4a3d0a4e2c0c93cc234364d2f",
  "assets/backgrounds/cosmos.webp": "919286f0575042d33166263b4db44c8acf84c011b12f6b0b53d9b817fa91866b",
  "assets/backgrounds/dunes-thumb.webp": "54d4fdc47bc6930e56b05ca4b36a832c18dc3220df8afd1f633ddfbc95502bcc",
  "assets/backgrounds/dunes.webp": "7977eb45fa49e651d799bb7d81208890bffa8aaa4b472a9bdac5009e59109cd1",
  "assets/backgrounds/forest-thumb.webp": "0c2d12da188d06ce2b8d922c8952f06c8b4199cc6b47ef49b9b42fb915e55af9",
  "assets/backgrounds/forest.webp": "456db66328263621b66e4333d93305c5529684c02250bebdce82b2f133a42aaf",
  "assets/backgrounds/glacier-thumb.webp": "088a46e31433ecb81411e49dce2afaa61d00fc18974553d07e56a6242610cd04",
  "assets/backgrounds/glacier.webp": "31da89e4025080e4cebef3fedd13fc39b7b355582c63f2518e2aa908a610e55c",
  "assets/backgrounds/mountains-thumb.webp": "9ed78525db2aea60dd2f5065154223236eb3e84551412a36c16214b85b9edc00",
  "assets/backgrounds/mountains.webp": "9cbcfb8a7dab978a59245bb97d5945836533cd87d4d73bd7d43055a436e81625",
  "assets/effects/aurora-light.svg": "ccef48f51af4db6787d8eca3c8ed7135fde56b2527de38561b456e1baa871f5b",
  "assets/effects/iridescence.svg": "3d6cc5abe828dac85fc8262c80116993843ca437332f79742123ebe6b73beec9",
  "assets/effects/waves.svg": "67f6577eeb4259e7fb413edb52c810415a587f05e3a6a4e03e46a74630acc94c",
  "assets/icons/app-icon-192.png": "aea21591d33a798b020d3d44d1a7f3b8447a845005c664639a665fc32ea351ce",
  "assets/icons/app-icon-512.png": "8230d3fa9fa4d9d1a86e3467e4a87eee8dfa63aa551b5d223cea102343f21133",
  "assets/icons/app-icon.svg": "28f4601be8622924619a55542b2ec08cd214eb0263d3448ad686e22b00dffe62",
  "assets/icons/apple-touch-icon.png": "7a47f25f7cee3e5d51d5b625a8bd507d0244e19b5ee516c366905f53fa34ca16",
  "assets/icons/developer.svg": "6afe0152d4c01b4ff647e8801d398978880d6f8351a13f5e5ce9fa37b1176df3",
  "assets/icons/logo.svg": "fbf4e047681490c2a2843ef5e2810c697eb93971f0733f120637c974c556c5bb",
  "assets/icons/maskable-icon-512.png": "2b6aa52a8ecaab54c0ded0dea5eb7a177ecaf7ec5257af06c4c0d9b418174762",
  "assets/icons/plus-ribbon.svg": "9c584e7ad312479c8cfe7c368007297a7e1037c66af072bacb1b4b3c7f7e8d9c",
  "assets/icons/sprite.svg": "7862feb0d0dfe8f60b03c98bec53d8c8217d536860ea6f45eef234126a09cfaf",
  "assets/profile-covers/aurora-thumb.webp": "666d7734b912c32fb77d6fd40fc076f5f20c9ca9a242c36857641b719eb4be38",
  "assets/profile-covers/aurora.webp": "ecea44e9fea7163b1e61b4e8de4cf244b270230a5135f6ef1b188f3784b4e0c8",
  "assets/profile-covers/cosmos-thumb.webp": "b958bf86f01725fa236f16b2e7bf0e8dfa0174ecdc648d6812c05a8ee7158128",
  "assets/profile-covers/cosmos.webp": "adb4cb2a82da243aca4d2754c16d6d9e728b361ecdfa748577d5a94f38ce360b",
  "assets/profile-covers/dunes-thumb.webp": "57887b7c42254f1fbd590525af554758e67f72bf33fa5abdac7e988e6f728a5c",
  "assets/profile-covers/dunes.webp": "832a22071b92d87e56380768c36c592e7976b13bf6cfe582d756913951f3eda0",
  "assets/profile-covers/forest-thumb.webp": "e6c28cde0bbef79d32130c8f0098812334bc358089b7707fba6a3291a6c7e4e2",
  "assets/profile-covers/forest.webp": "a61133f0b3e1d286a6cbb802bb7fdb1d178f3617028346941292ba3b7068034c",
  "assets/profile-covers/lake-thumb.webp": "e025b5f3459320d0674adee07f5598cd7b0f7a22aeb11785b28ae73aa69c879c",
  "assets/profile-covers/lake.webp": "f4f157f496aac4b4eca597cd46a22f7851e6f6e44c511ad82cf79f0a3721e718",
  "assets/profile-covers/mist-thumb.webp": "1143f36a30d8eef5d832cd38bab826b2386c8da76f6caa084f59ca9bade962fa",
  "assets/profile-covers/mist.webp": "117df0079672073fc5cab7662ba7e5d802416ac743925bf1489491b0b8c72d21",
  "assets/profile-covers/ocean-thumb.webp": "b32a4dfe60d965c5d76a9dd9e483d0a7581841d5554e1522e48a262995d98ad2",
  "assets/profile-covers/ocean.webp": "32ccb7f19794493551c8343a30e89baf881fbd3e91fb2a51a8d157dd63c66d41",
  "assets/profile-covers/summits-thumb.webp": "5b1ca5d874f85de8c75d71e2ee1b34be6bb0589551d4c5a39bfecf8437949535",
  "assets/profile-covers/summits.webp": "1a3e9ef3f8aeceff33b10761584178356511e950f900bf28019baaf6e4b2930f",
  "assets/profile-effects/aurora-far.svg": "78fd3cb3d91e1b9ad0d1298ccccd984d11a40b68c2d8a983034a6999ef66d7f7",
  "assets/profile-effects/aurora.svg": "8f91f13501be10799ed38cfc2592ce5484dccb450e7f190676858e3634440150",
  "assets/profile-effects/cosmos.svg": "f290b358ae6bb4115f956b6411bfbade9c9968d6acb7165b7ecc75d2fe47aced",
  "assets/profile-effects/mist-far.svg": "0001d10db3595c0895a40d20ad536b66d632da9cc4d39fca39dc2346b1722c23",
  "assets/profile-effects/mist.svg": "5e7da600e94c7435cb0bc28b931a993353154f2b5c710017d241e73fc8241399",
  "assets/profile-effects/stars-2.svg": "6607ae952b43837663d96437c88f5414d1d89eaa2cf9673ec5d0c83ff59c417c",
  "assets/profile-effects/stars-3.svg": "569a2e62b54d89bd45569760f2d091abd27b2f0908e59c4138bcd395404d785e",
  "assets/profile-effects/stars-4.svg": "5d711e0931fe05b1a8d87e8b335f1837685c3e26ac8683f41ccb6b2f68f766ef",
  "assets/profile-effects/stars.svg": "3bf8d8b08b0d9a38fce73359b56e47e108476b936d1e70f013b80d0ec0955d88",
  "index.html": "fdced62d93ff515ab7fe4cf1a40e86e603887fe1209b7b119a1327659ec9f378",
  "js/app.js": "5ab5324c3b5ec8d214400bf85e02ed8065f30421f4d5e630ee0f88d6a12d43c3",
  "js/core/access.js": "1f132b439725666c59582df3dcfbb5c820a86db08b3605c4927979552c9fbe6c",
  "js/core/activity-copy.js": "eda4ccc6a42539b9acd4fa6f9c41be5641f4586deeb0fea73be7a5e819475335",
  "js/core/appearance-copy.js": "1df382449b862b9f5d5915045f239f8009884d2d7c502b4088512c9bcc06f980",
  "js/core/appearance-tones.js": "a27a259bfca3976909d66c9fb526f97dded27fae02fff6cdd811e8c29875eef2",
  "js/core/appearance.js": "ecbcc79aaf18b2cbc236d2c7a64a182854389fe288ae01a6336e3319b0b54ad9",
  "js/core/asset-url.js": "9f1a9a803e32c10710607b06edd6331d0af5d486dde6e0a708d963fb50e6267f",
  "js/core/developer.js": "3bfdb650d08d19b69e626ff07fb168cd99a3137a7fb3ebf86c54f47b1ef0d200",
  "js/core/friends-copy.js": "20d81d41805e2f3266053cc0b7a9f91bd286af8e57bb1505d95c6468dbef54d8",
  "js/core/gesture-copy.js": "332542533055bad743ce480c316121a6b94c89cd28969a57fd3922391bde13cb",
  "js/core/gesture-tracker.js": "b1f055409e6334468b51148670fb5d93001c74f135b9c7abdfbd504b77914e0a",
  "js/core/i18n.js": "d7426765c95a47376ed728b5528dcc76e00a2dbd3e58966805b568580698b1a7",
  "js/core/loader.js": "daa0281930ec31f98e0831da22cce740afdcb83c02af5f64b5830e259443a054",
  "js/core/math.js": "dfa59715f533dcc6349f4aff95e9e4123bfdaa80d245edde642ff2431017c3d2",
  "js/core/photo-crop.js": "e09b8ef73f02257a753311084032988ffdfa95faa1ea96e6b0741e1e2e750bce",
  "js/core/premium-copy.js": "bb86b89d6ed7d7de6bf87c168c7482741cf9cb1a224ae8ec9456832b857fdbfc",
  "js/core/profile-copy.js": "2fe63a8092b859fd70f28a4aaef365b85f4da3647ea2b568dd8f427f4a4c7c85",
  "js/core/profile-style-copy.js": "1181c907708561a18647cf75ae3ff9ace6b0de2e928c736a42b20fd3add009b5",
  "js/core/profile-style.js": "2143976dedefb0a9ed0d68cbbe6dd65c19c7dc88cbb88fcf994d3e1b7aa76d8e",
  "js/core/selection-motion.js": "6a03ca601d4cd2e02a7ead1762b548bb69a7852b5a56f5a2091dda1ead17fb49",
  "js/core/settings-copy.js": "3fc84e61d93ad9d862e2b0754dd5e4d7a6054994d617dd301de75db68e00d874",
  "js/core/sounds.js": "3da4e959f69a3dde36d4926b6d13bff804514ccc1b98a8ce0b346e029216ba92",
  "js/core/statistics-copy.js": "8991015a7256553618922c9bb844978cfd6c774098c4660d3c294175153fb9ab",
  "js/core/store.js": "faea06aeeebac37cf5e154b6889579f53e4d79ac13aac4997f0b244ff2e2211e",
  "js/core/subscription-copy.js": "f2e64cc5c0f18ab10abf69c02b72a5b87f4a76b1982ef99acb1c0ff5b803c0c6",
  "js/core/subscription.js": "4d0eb604fce64d417059b9638b1287ff166170752400c387dcd672be16e6e1b2",
  "js/core/tilt.js": "17527aafb2fc29cc30346957fd4f540ceca549f62a82107c39afe299e3f811c8",
  "js/core/translations.js": "cb1058082df5c7c1d920f1791c8fd8cbfeb322cc0741ff61d0a3177bef7e6a04",
  "js/core/video-inference.js": "99234efac11ee98148f2ec976fdebbeb1a2becba4f27fe293a7067672b771bd8",
  "js/core/weather-copy.js": "71f6f5d9370433eacdf7ac68d10aa3546abccc732a513dd5023180e5d11dfae5",
  "js/core/weather.js": "28ac4426e104c894336d124a91a77bcea845956d2f215ba4b7bbcbbcb4635b12",
  "js/features/analytics.js": "b41d80ceb7bf3337f4d0cec7ebe7302bb9c08aa83cb4faf4b255f4cbfe9223e9",
  "js/features/appearance.js": "46afee1e755cb90465d35d6abb39a46f40940565b28723a6adea766aa0467efe",
  "js/features/audio-settings.js": "caabef3bea3dd626a23a6e0408580d047a4d0f26cd3332e9d811c3962e0a724a",
  "js/features/developer.js": "78a4409b7eb3cc39235eec195cdc92372d4dc9f8fd6dfb5633ca0e130dc5fbd9",
  "js/features/diary.js": "467ca930ba3c0185f9cdcbd8fe6b3f3066376f67229ea498f4cb466398eb3e7a",
  "js/features/gestures.js": "0f92cfdf4dd3da3aac5914a407b91d16095657afa551cf3749cc0c8d68c0b89d",
  "js/features/preferences.js": "a6bb1fba4552867f492480b7f402dff9733a96eb1dacd277460cded4b9c6574a",
  "js/features/products.js": "8a1f7667c513d8f826f81a2070aadbbcc251e570fec7180e28c976f916895867",
  "js/features/profile-style.js": "74bb2c89b6dab90cd8d66314eba045d2c3714fbae6c634a62f990ebd88301a15",
  "js/features/profile.js": "7abc7ed8d2f1fecf9b3288d1e9c68ac8281d947fba1306cd69716da01d6ef8fb",
  "js/features/subscription.js": "d9434bbcd615e83f142a2fb9c046b8c6ee33d034c2a7bfddf8904ce94bb0001d",
  "js/features/weather.js": "9e83eb90cf8a973cd4a431152e429c8773c71397dcfc6846a0f6483b2cc45d19",
  "js/services/friends.js": "e4061edc90bed1e4b194f782e93eadf6f734da2f255892efd70e03617e8d6353",
  "js/services/weather.js": "40f123b67fc594a33fb202ab6f5b36e9d5974ab121cf9fb5321a6595b4dad0e0",
  "js/ui/ambient.js": "fcb9fd5efb964cb3725d533268438690b5c8fb5421bb8dc1b62cbbef724e7310",
  "js/ui/boot.js": "b757854619ade83d91a9574de5f719ddbd21adea9cf0b9fe72c1d02021123e5f",
  "js/ui/components.js": "a19f69a3e5c677a762afedd25e22681c478138e29036c2024be5f505e0ff2e6e",
  "js/ui/cosmetic-timeline.js": "ecb873d333b3e71e7fca419d934622bf8313181760bb1e99344f1eaf75f510db",
  "js/ui/decorations.js": "6977259d7b5475a777a01367f8f495b5188a973288c0c6eb66fc3495e322f0d9",
  "js/ui/dock.js": "36a83e0bdbaf369d6245ce1677b1dbb5c3294a322f316df82cdaaa8dcce02948",
  "js/ui/haptics.js": "bae0864d49ab34775ef943ddf4244260f63dbb1b018e4e40625ff37c33e4710b",
  "js/ui/motion.js": "e249f72075305f77cc8e0d1d8605d4837da40f148b476f9dd96547ab1c35b7dd",
  "js/ui/nav-lens.js": "b24bfd26c80f42fd76c4891b0c9996421fb2f6f75ec180ff433ad20b942398fc",
  "js/ui/navigation.js": "0a6fc11a903ae929ce41366b974ae084013024af43f30b55093f489db07e088e",
  "js/ui/orientation.js": "21dadd7afe5fc20b860fc45cc315fa8ac94acd9c3a44fe2011784b6dae38c697",
  "js/ui/performance.js": "253df83f8bd78d34a5f8bf960be011cd0751199ec08e55fc1fc8b9a5d5227748",
  "js/ui/photo-editor.js": "a61494f78a244471f760305cd4130f967425155efa69333fb3de49cffe90437a",
  "js/ui/plus-ribbon.js": "9f43933cd9b3fad44832adf952d09b9882c454f79a64b8696defe27e08a80682",
  "js/ui/premium.js": "879e71acc7074e6ed19a253eb27298ee20bb5cc96330ae032033d68fa733d61c",
  "js/ui/profile-swipe.js": "76dd38f8ab8300af9c4e8ac80c9f9731b42fedc6720ca626c8ad135d9ae57470",
  "js/ui/pwa.js": "7052ac72fe98aa323dd0a4815223c0a017334e9fad7294740a5fef14256ef98b",
  "js/ui/selection-lens.js": "bf58c921364498b406f967fbe389ac522f3c13f22ea871786313de820f354b64",
  "js/ui/sheets.js": "2e8a5133ac16adb09d06aaf359379074c890d2c78fdadb2e91b281408b826ca7",
  "js/ui/sounds.js": "2445b068389347cba58850e0507b312d4ef882827bd0866c6939f6dc9176f399",
  "js/ui/surfaces.js": "95bd4d5a76428d638ab97ac28289d4c72b846843fed9428de945d22e28371531",
  "js/ui/viewport.js": "cfacf8a1e4dcf37e2fadd3a378892c585c0a3a88b6e11751d542f7445d312179",
  "manifest.webmanifest": "67a1c801fa84b854528572b9add2e84862eb3eb15ea1d8439103361d82de21cc",
  "styles/activity.css": "6feb1992f54638c109eca5d3038b48946dd5c8cfc09acaf1ee2e6529cb760bec",
  "styles/appearance-backgrounds.css": "c91879aecf6ed4fb765ab3928caebcf12009119bf3c9e81c8a88587f3fd0e692",
  "styles/appearance-palette.css": "b3418dd5a463564cabf5edf6b932f13bf35deafb61c91072c82d49f1b9998815",
  "styles/appearance.css": "f30cc76bd395a2f9c296a4c17cbd1056eb5f5e7cb90de8245c452e1f4a477683",
  "styles/base.css": "e63750594a135f7db4e666a2372ca994af987c8bfc1b7eef47222c77340c44be",
  "styles/components.css": "d7c18dce7af6dc723b03b47522180640b97d77c30d3ea18b8badb5feef066c57",
  "styles/friends.css": "57da1967d09df676259abd5eafb88ae9b871245d14ff02d7990fde1200764196",
  "styles/glass.css": "2b7eba104e5bffbc8272360ec01085a7c97958b29b8276a6ee8877c0648f5cdd",
  "styles/interactions.css": "c078489d2c026f26554aa002ae39a6009dcdb62f3a2582a21e82c49cda11ee18",
  "styles/layout.css": "70d5a30b3db98282a642e12261d8551d0e0661dee083b67f5d7697ac9fd7ce76",
  "styles/motion.css": "9d5c344f3fd0d6a08ea0407fecd61e6dd6a04fac41bf0e259cdf6cdd5f474935",
  "styles/performance.css": "6afe7b299a356fec0480d88ca5f62c171435cfa84dceba1fb4b3fbf46d4bc2e2",
  "styles/photo-crop.css": "a803e6d2b47118af6f2e6ac5c43f5778c2299cdf58f6b8d325371b6c87086aac",
  "styles/premium.css": "25e08ea77f0ca95d2ae09356015878b9f45cf39f374c11bc3ce9071c286f3ebb",
  "styles/profile-style.css": "8994b097bced94f6b2d41f4138d64010c9358926eab7a8d6943168103b55df1a",
  "styles/profile.css": "51af115dbed9b29abc5097272bcd9e53e091ea33d113cdc44e1dd455c8d66069",
  "styles/refinement.css": "3cfdde89d9bfc0f6a60dcc94d38b6a18dfa618a8b68fa8d12c028c83be24b90e",
  "styles/selection-lens.css": "758e9d1a4ae061464a2ed15b229685127a97de25eb8c11e620b20b23d6667177",
  "styles/settings.css": "ec32fdce87246e39dcac38872007573163e278d855f2add70f446d4769fd72b1",
  "styles/smart-water.css": "e8d160164cc5e1727a39fcd6eb4fa71e0268513b0604499531972035f8f3b9d5",
  "styles/startup.css": "892be869e99b0cadfad79c37754887b6d42d8d6aea0445facf54cc3dc562e33a",
  "styles/statistics.css": "ba4338d9aea6f27c5a87532f72f9f4ac48c86790180d44025a1de660b45d1531",
  "styles/subscription.css": "2930eca6fa68d5034649bd0e953423fa5527d072092459bee626a0e296b68e1c",
  "styles/today.css": "60e30dd94245b2bb21229e401434f5ddf0b9188de9a263d947315e61e2421754",
  "styles/tokens.css": "05fb694b4b89e5478e6e8d9d184383fc3debd0b97e0daf599882bf85e184e373"
};
// END ASSET HASHES
const urls = APP_FILES.map(file => new URL(file, ROOT).href);
const allowed = new Set(urls);
const indexURL = new URL('index.html', ROOT).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const previous = await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).reverse().map(key => caches.open(key)));
    const digest = async response => {
      if (!globalThis.crypto?.subtle) return null;
      const bytes = await response.clone().arrayBuffer();
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    };
    let index = 0, failure;
    const worker = async () => {
      while (!failure && index < APP_FILES.length) {
        const file = APP_FILES[index++], url = new URL(file, ROOT).href;
        try {
          const expected = ASSET_HASHES[file]; let response;
          // Filename equality is insufficient: only identical bytes may be reused.
          if (expected && globalThis.crypto?.subtle) for (const old of previous) {
            const candidate = await old.match(url);
            if (candidate?.ok && await digest(candidate) === expected) { response = candidate; break; }
          }
          if (!response) {
            response = await fetch(new Request(url, { cache: 'reload' }));
            if (!response.ok) throw new Error(`Offline asset unavailable: ${file}`);
            if (expected && globalThis.crypto?.subtle && await digest(response) !== expected) throw new Error(`Offline asset changed during deployment: ${file}`);
          }
          await cache.put(url, response);
        } catch (error) { failure ??= error; }
      }
    };
    // Bounded memory/network use; retain the previous complete offline release
    // if a partial deployment or interrupted download prevents installation.
    await Promise.all(Array.from({ length: 4 }, worker));
    if (failure) { await caches.delete(CACHE); throw failure; }
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT)) return;
  // Firebase, food APIs and third-party libraries keep their normal network behavior.
  const canonical = url.origin + url.pathname;
  if (request.mode !== 'navigate' && !allowed.has(canonical)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request.mode === 'navigate' ? indexURL : canonical);
    return cached || fetch(request);
  })());
});
