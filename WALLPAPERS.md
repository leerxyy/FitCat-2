# Фоны FitCat 3.16.0

Шесть новых изображений созданы встроенной генерацией изображений. Ранее созданные «Горы» сохранены по содержанию и перекодированы. Для сайта используются WebP и отдельные миниатюры; оригиналы в архив не включены, чтобы не увеличивать загрузку.

## cosmos

Файл: `assets/backgrounds/cosmos.webp`. Миниатюра: `assets/backgrounds/cosmos-thumb.webp`.

Описание для генерации:

Use case: photorealistic-natural. Asset type: premium smartphone app wallpaper, portrait 9:19.5 composition. Primary request: a breathtaking but realistic deep-space astrophotograph, dense fine natural stars with a vast wispy interstellar nebula, blue cyan and muted violet gas filaments, almost black navy empty regions, physically plausible astronomy, understated Hubble / James Webb photographic detail. No large planet, no drawn shapes, no graphic illustration, no neon rainbow, no text or logo or interface. Composition atmospheric and spacious, bright detail concentrated around upper and outer edges, center and lower-middle dark and calm so white app text can remain readable. Full bleed high quality wallpaper.

## aurora

Файл: `assets/backgrounds/aurora.webp`. Миниатюра: `assets/backgrounds/aurora-thumb.webp`.

Описание для генерации:

Use case: photorealistic-natural. Asset type: premium smartphone app wallpaper, tall portrait 9:19.5. Primary request: realistic spectacular northern lights over a dark Norwegian fjord at night, fine translucent emerald and subtle cyan aurora curtains sweeping across a deep navy starry sky, distant snow mountains and nearly black pine silhouettes at bottom, still water reflecting a little light. Professional natural landscape night photograph, fine texture, restrained luminous atmosphere, real aurora not painted brush strokes. Spacious dark center for white glass UI overlays. No people, buildings, no words, logos, frames, interface or watermark. Full bleed.

## forest

Файл: `assets/backgrounds/forest.webp`. Миниатюра: `assets/backgrounds/forest-thumb.webp`.

Описание для генерации:

Use case: photorealistic-natural. Asset type: premium smartphone wallpaper, tall portrait 9:19.5. Primary request: cinematic realistic misty pine forest in a mountain valley at blue hour. Foreground slender dark evergreen trees at lower left and right framing layers of progressively softer distant forest ridges and cool morning fog. Forest green, petrol teal, almost black navy. Ethereal high-end natural photography with a convincing sense of spatial depth, calm open dark central area for translucent UI and white text. No fantasy, no graphic drawing, no people or buildings, no text logos or interface. Full bleed.

## dunes

Файл: `assets/backgrounds/dunes.webp`. Миниатюра: `assets/backgrounds/dunes-thumb.webp`.

Описание для генерации:

Use case: photorealistic-natural. Asset type: premium smartphone wallpaper, tall portrait 9:19.5. Primary request: beautiful sculptural sand dunes at late blue hour, sinuous natural dune ridges, terracotta and muted warm copper highlights on ridges, deep violet-brown navy shadows, dim glowing peach horizon at upper quarter fading to a dark ink sky. Exquisite realistic landscape photograph, subtle sand texture and spatial depth. Dark balanced exposure suitable behind translucent dark UI with white text, luminous edges rather than a bright center. Full bleed, no people, buildings, plants, text, logos, symbols or interface.

## coast

Файл: `assets/backgrounds/coast.webp`. Миниатюра: `assets/backgrounds/coast-thumb.webp`.

Описание для генерации:

Use case: photorealistic-natural. Asset type: premium smartphone wallpaper, tall portrait 9:19.5. Primary request: dramatic beautiful dark Atlantic coastline at dusk, realistic aerial oblique view with midnight navy ocean taking most of picture, delicate pale turquoise wave foam wrapping dark cliffs and rocks near lower right and bottom, atmospheric mist and soft distant violet horizon at top. Professional long-exposure landscape photograph, natural fluid ocean detail, calm elegant cinematic exposure. Plenty of open dark space centrally for a white text glass UI overlay. No humans, buildings, text, logos, illustration or interface. Full bleed.

## glacier

Файл: `assets/backgrounds/glacier.webp`. Миниатюра: `assets/backgrounds/glacier-thumb.webp`.

Описание для генерации:

Use case: photorealistic-natural. Asset type: premium smartphone wallpaper, tall portrait 9:19.5. Primary request: serene dramatic Icelandic glacier lagoon in predawn blue hour, dark still water, luminous sculpted icebergs and faceted translucent blue glacier near lower edges, distant snowy mountains and soft dim lavender-blue horizon. A few layered ice ridges create convincing foreground, middle-distance and far spatial depth. Premium natural landscape photography, fine realistic ice textures, restrained silver and arctic blue light, navy shadows. Expose dark enough for white app text and translucent cards. No people or buildings, no text logos symbols or interface, no fantasy. Full bleed.

## mountains

Ранее сгенерированный фон: `assets/backgrounds/mountains.webp`; миниатюра: `assets/backgrounds/mountains-thumb.webp`.

3D-параллакс — декоративная композиция ближнего и дальнего планов одного изображения с мягкой маской; это не трёхмерная модель. Исходный логотип находится в `assets/icons/logo.svg`. Волны, сияние и перелив — авторские SVG-маски в `assets/effects`, анимируемые кодом без сетевого сервиса.


## Обложки профиля — 3.19.0

В `assets/profile-covers/` находятся восемь отдельных панорамных изображений 1040×440 и восемь миниатюр 320×136: `mist`, `lake`, `dunes`, `forest`, `ocean`, `aurora`, `cosmos`, `summits`. Они созданы встроенной генерацией изображений по одобренной подборке, затем подготовлены для сайта в WebP. Это самостоятельные обложки, а не фрагменты интерфейсного макета. Общий вес изображений с миниатюрами — 884 046 байт.

В `assets/profile-effects/` — оригинальные локальные SVG-слои: мягкие световые ленты, редкие звёзды, космическая дымка и облака. Они дополняют фотографию и двигаются через transform/opacity; новых сторонних библиотек нет. Рамки аватаров построены средствами CSS, чтобы плавно двигать блики, грани и орбитальные точки без покадровой перерисовки больших изображений.


## Живые слои — 3.19.1

Текстуры переработаны: 54 нерегулярно расположенные звезды в четырёх небольших SVG, два слоя северного сияния и два слоя тумана. В них нет скриптов, SVG-анимаций и фильтров. CSS двигает/смешивает уже отрисованные слои, а генератор `tools/generate_profile_effects.py` воспроизводит исходные векторы детерминированно. Панорамные WebP и сохранённые идентификаторы обложек не менялись.


## Ночные города — 3.20.0

В `assets/profile-covers/` добавлены `tokyo`, `chongqing`, `moscow`, `dubai`:
полные WebP 1440×960 и миниатюры 480×320. Это настоящие фотографии реальных мест.
Источники, авторы, лицензии и замечание о панорамном использовании Дубая —
в `CITY-CREDITS.md` и `assets/profile-covers/cities.sources.json`.

В `assets/profile-effects/` находятся четыре карты существующих огней 720×480,
две бесшовные текстуры дождя и два слоя дымки. Световые карты совмещены с тем
же снимком и его движением, фоновые детали не перерисованы и не выдуманы.
Глубина — декоративный параллакс фотографии, атмосферных слоёв и отражений,
не трёхмерная модель города. Для Москвы слой движущихся отражений выключен:
на выбранном кадре видны фасады, а не вода. Неподвижные миниатюры не имитируют
видео и не запускают эффекты всех городов одновременно.
