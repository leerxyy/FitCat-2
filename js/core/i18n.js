import { state } from './store.js';
import { translations } from './translations.js';
import { subscriptionCopy } from './subscription-copy.js';
import { walletCopy } from './wallet-copy.js';
import { weatherCopy } from './weather-copy.js';
import { premiumCopy } from './premium-copy.js';
import { activityCopy } from './activity-copy.js';
import { statisticsCopy } from './statistics-copy.js';
import { friendsCopy } from './friends-copy.js';
import { profileCopy } from './profile-copy.js';
import { settingsCopy } from './settings-copy.js';
import { appearanceCopy } from './appearance-copy.js';
import { profileStyleCopy } from './profile-style-copy.js';
import { profileCityCopy } from './profile-city-copy.js';
import { engagementCopy } from './engagement-copy.js';

const additions = {
  ru: {
    smart_water_conditions: 'Учитывать условия', smart_water_goal: 'Цель на сегодня', smart_water_extra_base: 'к базовой цели', smart_water_base_goal: 'Базовая цель', smart_water_temperature: 'Температура воздуха', smart_water_steps: 'Шаги за день', smart_water_off_hint: 'Включите, чтобы учитывать температуру и шаги.',
    startup_loading: 'Загружаем дневник', startup_error: 'Не удалось открыть FitCat. Попробуй ещё раз.', startup_retry: 'Повторить запуск', orientation_title: 'Поверните телефон', orientation_hint: 'FitCat работает в вертикальном режиме',
    haptics: 'Виброотклик', test_haptics: 'Проверить отклик', haptics_unavailable: 'Этот браузер не предоставляет виброотклик.',
    meals: 'Приёмы пищи', analytics: 'Статистика', add_food: 'Добавить еду', add_friend: 'Добавить друга', add_weight: 'Добавить запись веса', weight_date: 'Дата измерения веса',
    remaining: 'ккал осталось', over_target: 'ккал сверх цели', eaten: 'Съедено', target: 'Цель',
    breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус', other: 'Продукты',
    empty_title: 'Твой дневник на сегодня', empty_description: 'Добавь еду — здесь появятся приёмы пищи и твой прогресс.',
    food_portion: 'Порция', meal_type: 'Приём пищи', already_eaten: 'Уже съедено', planned: 'Запланировано',
    food_saved: 'Добавлено в дневник', food_deleted: 'Продукт удалён', water_added: 'Вода добавлена', undo: 'Отменить',
    more: 'Ещё', other_volume: 'Другой объём', water_total: 'Всего выпито, мл', set_water: 'Сохранить объём', l: 'л',
    no_history: 'Записей пока нет', no_history_hint: 'Добавь первую запись, чтобы увидеть изменения.',
    saved: 'Изменения сохранены', invalid_backup: 'Это не резервная копия FitCat или данные в ней повреждены.',
    import_confirm: 'Заменить текущие данные содержимым этой резервной копии?', import_done: 'Данные восстановлены',
    save_error: 'Не удалось сохранить данные. Освободи место на устройстве и повтори попытку.',
    network_error: 'Не удалось загрузить данные. Проверь соединение и попробуй ещё раз.', retry: 'Повторить',
    search_hint: 'Ищи в своих продуктах или включи поиск Open Food Facts.', search_online: 'Поиск по базе продуктов',
    searching: 'Ищем продукты…', per_portion: 'На порцию', local_product: 'Мои продукты',
    delete: 'Удалить', edit: 'Изменить', done: 'Готово', confirm: 'Подтвердить', confirmation: 'Подтверждение',
    clear_food_confirm: 'Очистить сегодняшний дневник питания?', delete_record: 'Удалить эту запись?',
    template_saved: 'Шаблон сохранён', load_template_confirm: 'Заменить сегодняшний список еды этим шаблоном?',
    photo_hint: 'Нажми, чтобы изменить фото', friends_empty: 'Тренироваться вместе приятнее',
    friends_empty_hint: 'Добавь друга по его ID из профиля, чтобы видеть прогресс.', friend_id: 'ID друга',
    my_id: 'Мой ID', copy_id: 'Скопировать ID', copied: 'ID скопирован', invalid_id: 'Введи ID из 11 цифр',
    own_id: 'Это твой собственный ID', online: 'Онлайн', offline: 'Не в сети', not_available: 'Пока нет данных',
    friend_privacy: 'Друзья видят имя, цели, сегодняшний дневник и воду по твоему ID.',
    gesture_control: 'Управление жестами', gesture_description: 'Переключай вкладки и управляй приложением через камеру.',
    gesture_on: 'Жесты включены', gesture_off: 'Жесты выключены', camera_unavailable: 'Камера недоступна. Используй HTTPS и разреши доступ к камере.',
    days: 'дн.', streak: 'Серия', scanner_loading: 'Подготавливаем камеру…', lookup: 'Найти продукт',
    profile_subtitle: 'Твои данные и цели', settings_subtitle: 'Настрой FitCat под себя',
    activity_subtitle: 'Настройки нагрузки на сегодня', analytics_subtitle: 'Твои изменения во времени',
    friends_subtitle: 'Поддерживайте друг друга', product_subtitle: 'Твоя личная база продуктов',
    setup_subtitle: 'Настроим дневник под твои цели', data_local: 'Профиль и дневник сохраняются на этом устройстве.',
    update_available: 'Доступна новая версия FitCat', update: 'Обновить', photo_error: 'Не удалось открыть фото',
  },
  en: {
    smart_water_conditions: 'Account for conditions', smart_water_goal: 'Today’s water goal', smart_water_extra_base: 'added to the base target', smart_water_base_goal: 'Base target', smart_water_temperature: 'Air temperature', smart_water_steps: 'Steps today', smart_water_off_hint: 'Enable to account for temperature and steps.',
    startup_loading: 'Opening your diary', startup_error: 'Could not open FitCat. Please try again.', startup_retry: 'Try again', orientation_title: 'Rotate your phone', orientation_hint: 'Use FitCat in portrait orientation',
    haptics: 'Haptic feedback', test_haptics: 'Test feedback', haptics_unavailable: 'This browser does not provide haptic feedback.',
    meals: 'Meals', analytics: 'Statistics', add_food: 'Add food', add_friend: 'Add friend', add_weight: 'Add weight entry', weight_date: 'Weight measurement date', remaining: 'kcal remaining', over_target: 'kcal over target',
    eaten: 'Eaten', target: 'Target', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', other: 'Foods',
    empty_title: 'Your diary for today', empty_description: 'Add food to see your meals and daily progress.',
    food_portion: 'Portion', meal_type: 'Meal', already_eaten: 'Already eaten', planned: 'Planned', food_saved: 'Added to diary',
    food_deleted: 'Food removed', water_added: 'Water added', undo: 'Undo', more: 'More', other_volume: 'Other amount',
    water_total: 'Total water, ml', set_water: 'Save amount', l: 'L', no_history: 'No entries yet',
    no_history_hint: 'Add your first entry to see changes.', saved: 'Changes saved',
    invalid_backup: 'This is not a valid FitCat backup.', import_confirm: 'Replace your current data with this backup?',
    import_done: 'Data restored', save_error: 'Could not save. Free some device storage and try again.',
    network_error: 'Could not load data. Check your connection and try again.', retry: 'Retry',
    search_hint: 'Search your foods or enable Open Food Facts search.', search_online: 'Search food database', searching: 'Searching…',
    per_portion: 'Per portion', local_product: 'My foods', delete: 'Delete', edit: 'Edit', done: 'Done', confirm: 'Confirm',
    confirmation: 'Confirmation', clear_food_confirm: 'Clear today’s food diary?', delete_record: 'Delete this entry?',
    template_saved: 'Template saved', load_template_confirm: 'Replace today’s foods with this template?',
    photo_hint: 'Tap to change photo', friends_empty: 'Better together',
    friends_empty_hint: 'Add a friend using their profile ID to see their progress.', friend_id: 'Friend ID', my_id: 'My ID',
    copy_id: 'Copy ID', copied: 'ID copied', invalid_id: 'Enter an 11-digit ID', own_id: 'This is your own ID',
    online: 'Online', offline: 'Offline', not_available: 'No data yet',
    friend_privacy: 'Friends can see your name, targets, today’s food and water using your ID.',
    gesture_control: 'Gesture control', gesture_description: 'Use your camera to switch tabs and control the app.',
    gesture_on: 'Gestures enabled', gesture_off: 'Gestures disabled',
    camera_unavailable: 'Camera unavailable. Use HTTPS and allow camera access.', days: 'days', streak: 'Streak',
    scanner_loading: 'Preparing camera…', lookup: 'Find food', profile_subtitle: 'Your details and goals',
    settings_subtitle: 'Make FitCat yours', activity_subtitle: 'Today’s activity settings', analytics_subtitle: 'Your progress over time',
    friends_subtitle: 'Support each other', product_subtitle: 'Your personal food database',
    setup_subtitle: 'Let’s set up your food diary', data_local: 'Your profile and diary are stored on this device.',
    update_available: 'A new FitCat version is available', update: 'Update', photo_error: 'Could not open this photo',
  },
  cn: {
    smart_water_conditions: '考虑环境和步数', smart_water_goal: '今日饮水目标', smart_water_extra_base: '添加到基础目标', smart_water_base_goal: '基础目标', smart_water_temperature: '气温', smart_water_steps: '今日步数', smart_water_off_hint: '开启后，将考虑气温和步数。',
    startup_loading: '正在打开日记', startup_error: '无法打开 FitCat，请重试。', startup_retry: '重试', orientation_title: '请竖直握持手机', orientation_hint: 'FitCat 使用竖屏模式',
    haptics: '触觉反馈', test_haptics: '测试触感', haptics_unavailable: '此浏览器不提供触觉反馈。',
    meals: '餐食', analytics: '统计', add_food: '添加食物', add_friend: '添加好友', add_weight: '添加体重记录', weight_date: '体重测量日期', remaining: '剩余千卡', over_target: '超出千卡',
    eaten: '已摄入', target: '目标', breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', other: '食物',
    empty_title: '今天的饮食日记', empty_description: '添加食物，查看餐食和每日进度。', food_portion: '分量', meal_type: '餐次',
    already_eaten: '已食用', planned: '计划', food_saved: '已添加', food_deleted: '已删除食物', water_added: '已添加饮水',
    undo: '撤销', more: '更多', other_volume: '其他水量', water_total: '已饮水总量，毫升', set_water: '保存水量', l: '升',
    no_history: '暂无记录', no_history_hint: '添加第一条记录，查看变化。', saved: '已保存', invalid_backup: '不是有效的 FitCat 备份文件。',
    import_confirm: '用此备份替换当前数据？', import_done: '已恢复数据', save_error: '无法保存，请清理设备存储空间后重试。',
    network_error: '无法加载数据，请检查网络连接。', retry: '重试', search_hint: '搜索个人食物或开启 Open Food Facts 搜索。',
    search_online: '搜索食物数据库', searching: '搜索中…', per_portion: '每份', local_product: '个人食物', delete: '删除',
    edit: '编辑', done: '完成', confirm: '确认', confirmation: '确认操作', clear_food_confirm: '清空今天的食物？',
    delete_record: '删除这条记录？', template_saved: '已保存模板', load_template_confirm: '用此模板替换今天的食物？',
    photo_hint: '点击更换照片', friends_empty: '一起坚持更轻松', friends_empty_hint: '输入好友个人资料中的 ID，查看其进度。',
    friend_id: '好友 ID', my_id: '我的 ID', copy_id: '复制 ID', copied: '已复制 ID', invalid_id: '请输入11位数字 ID',
    own_id: '这是你自己的 ID', online: '在线', offline: '离线', not_available: '暂无数据',
    friend_privacy: '好友可通过你的 ID 查看姓名、目标、今日食物和饮水记录。',
    gesture_control: '手势控制', gesture_description: '通过摄像头切换标签并控制应用。', gesture_on: '已开启手势', gesture_off: '已关闭手势',
    camera_unavailable: '无法使用摄像头，请使用 HTTPS 并允许访问。', days: '天', streak: '连续记录', scanner_loading: '准备摄像头…',
    lookup: '查找食物', profile_subtitle: '个人信息和目标', settings_subtitle: '自定义 FitCat', activity_subtitle: '今日活动设置',
    analytics_subtitle: '查看长期变化', friends_subtitle: '相互支持', product_subtitle: '个人食物数据库',
    setup_subtitle: '设置你的饮食日记', data_local: '个人资料和日记保存在此设备上。',
    update_available: 'FitCat 有新版本', update: '更新', photo_error: '无法打开照片',
  },
};

for (const language of Object.keys(additions)) Object.assign(translations[language], additions[language], subscriptionCopy[language], walletCopy[language], weatherCopy[language], premiumCopy[language], activityCopy[language], statisticsCopy[language], friendsCopy[language], profileCopy[language], settingsCopy[language], appearanceCopy[language], profileStyleCopy[language], profileCityCopy[language], engagementCopy[language]);

export function t(key) {
  return translations[state.preferences.lang]?.[key] ?? translations.ru[key] ?? key;
}

export function locale() {
  return state.preferences.lang === 'cn' ? 'zh-CN' : state.preferences.lang === 'en' ? 'en-US' : 'ru-RU';
}

const numberFormats = new Map();
export function number(value, digits = 0) {
  const language = locale(), key = `${language}:${digits}`;
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(language, { maximumFractionDigits: digits });
    if (numberFormats.size >= 16) numberFormats.clear();
    numberFormats.set(key, formatter);
  }
  return formatter.format(Number(value) || 0);
}

export function translate(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-label]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nLabel)); });
  root.querySelectorAll('[data-i18n-title]').forEach(element => { element.title = t(element.dataset.i18nTitle); });
  if (root === document) document.documentElement.lang = state.preferences.lang === 'cn' ? 'zh-Hans' : state.preferences.lang;
}
