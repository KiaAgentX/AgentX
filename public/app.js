/* ═══════════════════════════════════════════════════════════════════════════
   KIA DropAgentX — Dashboard SPA (vanilla JS, no build step)
   Hash router · i18n (en/fa/ru/ar) · SSE live updates · Owner key unlock
   Consumes docs/API.md exactly: { ok:true, data } | { ok:false, error }
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* ─────────────────────────── i18n dictionaries ─────────────────────────── */
  const I18N = {
    en: {
      'a11y.skip': 'Skip to content',
      'brand.tagline': 'Command center',
      'overview.hintStars': 'Telegram Stars', 'overview.hintCredits': 'credits',
      'overview.hintAi': 'AI calls 24h: {n}', 'crm.funnelHint': 'new → warm → won',
      'settings.langHint': 'FA / AR switch the whole UI to RTL.',
      'settings.themeHint': 'Dark is the default. Light keeps the same accents.',
      'nav.overview': 'Overview', 'nav.market': 'Market', 'nav.orders': 'Orders',
      'nav.wallets': 'Wallets', 'nav.quests': 'Quests', 'nav.leaderboard': 'Leaderboard',
      'nav.bookings': 'Bookings', 'nav.owner': 'Owner', 'nav.settings': 'Settings',
      'nav.crm': 'CRM',
      'crm.subtitle': 'Import, dedupe and close your leads', 'crm.searchPh': 'Search contact, name, company…',
      'crm.addTitle': 'Quick add', 'crm.importTitle': 'Import JSON', 'crm.importHint': 'Array of {contact, name?, company?, stage?, score?, tags?} rows — duplicates are skipped.',
      'crm.importBtn': 'Import', 'crm.addBtn': 'Add lead', 'crm.contact': 'Contact', 'crm.stage': 'Stage',
      'crm.name': 'Name', 'crm.lastTouch': 'Last touch',
      'crm.source': 'Source', 'crm.score': 'Score', 'crm.stats.total': 'Leads', 'crm.stats.wonRate': 'Won rate',
      'crm.stats.fresh': 'New 24h', 'crm.empty': 'No leads yet — import or add your first one',
      'crm.imported': 'Imported: {n}', 'crm.skipped': 'Skipped (dupes): {n}', 'crm.invalid': 'Invalid rows: {n}', 'crm.stageAll': 'All',
      'topbar.unlock': 'Owner', 'topbar.owner': 'Owner', 'topbar.live': 'Live',
      'topbar.polling': 'Polling', 'topbar.offline': 'Offline',
      'common.cancel': 'Cancel', 'common.save': 'Save', 'common.close': 'Close',
      'common.error': 'Something went wrong', 'common.prev': 'Prev', 'common.next': 'Next',
      'common.retry': 'Retry', 'common.showing': '{a}–{b} of {total}', 'common.empty': 'Nothing here yet',
      'status.paid': 'Paid', 'status.pending': 'Pending', 'status.delivered': 'Delivered',
      'status.new': 'New', 'status.warm': 'Warm', 'status.won': 'Won', 'status.lost': 'Lost',
      'status.refunded': 'Refunded', 'status.cancelled': 'Cancelled', 'status.active': 'Active',
      'status.archived': 'Archived', 'status.confirmed': 'Confirmed',
      'status.ok': 'OK', 'status.denied': 'Denied', 'status.error': 'Error',
      'overview.subtitle': 'Live snapshot of the last 24 hours',
      'overview.users': 'Users', 'overview.products': 'Products', 'overview.orders': 'Orders',
      'overview.revenueStars': 'Revenue ⭐', 'overview.revenueCredits': 'Revenue 💎',
      'overview.pendingApprovals': 'Pending approvals',
      'overview.chart': 'Last 14 days', 'overview.chartRevenue': 'Revenue', 'overview.chartOrders': 'Orders',
      'overview.topProducts': 'Top products', 'overview.recentOrders': 'Recent orders',
      'overview.salesCount': 'sales', 'overview.emptyChart': 'No activity in the last 14 days',
      'market.subtitle': 'Browse the product catalog', 'market.searchPh': 'Search products…',
      'market.newProduct': 'New product', 'market.editProduct': 'Edit product',
      'market.title': 'Title', 'market.category': 'Category', 'market.priceStars': 'Price ⭐ (Stars)',
      'market.priceCredits': 'Price 💎 (Credits)', 'market.stock': 'Stock',
      'market.stockHint': '-1 = unlimited', 'market.description': 'Description',
      'market.featured': 'Featured', 'market.active': 'Active (listed)',
      'market.edit': 'Edit', 'market.archive': 'Archive',
      'market.confirmArchive': 'Archive this product? It will disappear from the market.',
      'market.sales': 'sales', 'market.unlimited': 'Unlimited', 'market.created': 'Product created',
      'market.empty': 'No products yet', 'market.noResults': 'No products match your search',
      'orders.subtitle': 'Escrow lifecycle for every sale', 'orders.product': 'Product',
      'orders.buyer': 'Buyer', 'orders.total': 'Total', 'orders.status': 'Status',
      'orders.date': 'Date', 'orders.actions': 'Actions', 'orders.deliver': 'Deliver',
      'orders.cancel': 'Cancel', 'orders.refund': 'Refund',
      'orders.confirmDeliver': 'Deliver this order to the buyer?', 'orders.confirmCancel': 'Cancel this order and release reserved stock?',
      'orders.confirmRefund': 'Refund this order? The request goes through human approval (HITL).',
      'orders.empty': 'No orders found', 'orders.all': 'All',
      'wallets.subtitle': 'Balances, holds and accounts', 'wallets.wallets': 'Wallets',
      'wallets.users': 'Users', 'wallets.balance': 'Balance 💎', 'wallets.locked': 'Locked',
      'wallets.credits': 'Credits', 'wallets.role': 'Role', 'wallets.language': 'Language',
      'wallets.joined': 'Joined', 'wallets.user': 'User', 'wallets.empty': 'No accounts yet',
      'quests.subtitle': 'Active missions for the current period', 'quests.reward': 'Reward',
      'quests.xp': 'XP', 'quests.completed': 'Completed', 'quests.empty': 'No quests available',
      'quests.daily': 'Daily', 'quests.weekly': 'Weekly', 'quests.onetime': 'One-time',
      'lb.subtitle': 'Top performers across the board', 'lb.xp': 'XP', 'lb.sales': 'Sales', 'lb.ref': 'Referrals',
      'lb.unit.xp': 'XP', 'lb.unit.sales': 'sales', 'lb.unit.ref': 'refs', 'lb.empty': 'No entries yet',
      'bookings.subtitle': 'Upcoming scheduled sessions', 'bookings.user': 'User',
      'bookings.slot': 'Slot', 'bookings.empty': 'No upcoming bookings',
      'owner.subtitle': 'Approvals, broadcasts, settings and security',
      'owner.approvals': 'Approvals queue', 'owner.approve': 'Approve', 'owner.reject': 'Reject',
      'owner.notePrompt': 'Optional note for the decision:', 'owner.noApprovals': 'Approval queue is empty — all clear ✨',
      'owner.expires': 'expires', 'owner.broadcast': 'Broadcast', 'owner.broadcastPh': 'Message to send to all users…',
      'owner.broadcastHint': 'The broadcast is queued for your approval (HITL) before sending.',
      'owner.send': 'Queue broadcast', 'owner.broadcastQueued': 'Broadcast queued for approval',
      'owner.settingsTitle': 'Settings', 'owner.security': 'Security — 15 layers',
      'owner.audit': 'Audit log (latest)', 'owner.activeState': 'active', 'owner.inactiveState': 'inactive',
      'owner.time': 'Time', 'owner.actor': 'Actor', 'owner.action': 'Action', 'owner.target': 'Target',
      'owner.statusCol': 'Verdict', 'owner.value': 'Value', 'owner.keyTitle': 'Owner key',
      'owner.keyHint': 'Stored only in this browser (localStorage). Used as the X-KIA-Key header.',
      'owner.saveKey': 'Unlock', 'owner.clearKey': 'Clear key', 'owner.keyPh': 'Owner key',
      'owner.unlockTitle': 'Unlock Owner mode', 'owner.unlockHint': 'Paste the dashboard owner key (DASHBOARD_KEY). It is stored only in this browser.',
      'locked.title': 'Owner access required', 'locked.text': 'This section is protected. Unlock it with the dashboard owner key to continue.',
      'settings.subtitle': 'Language, theme, owner key and about',
      'settings.language': 'Language', 'settings.theme': 'Dark theme', 'settings.dark': 'Dark',
      'settings.light': 'Light', 'settings.ownerKey': 'Owner key', 'settings.ownerKeyHint': 'Save the key to unlock the Owner tab and management actions.',
      'settings.about': 'About', 'settings.version': 'Version', 'settings.uptime': 'Uptime',
      'settings.system': 'Services', 'settings.license': 'License', 'settings.made': 'Crafted for Telegram business operators.',
      'toast.ownerRequired': 'Owner key required', 'toast.error': 'Request failed',
      'toast.saved': 'Saved', 'toast.done': 'Done', 'toast.unlocked': 'Owner mode unlocked',
      'toast.keyCleared': 'Owner key cleared', 'toast.keyInvalid': 'Invalid owner key',
      'toast.newApproval': 'New approval is waiting', 'toast.paid': 'Payment received',
      'toast.delivered': 'Order delivered', 'toast.broadcastQueued': 'Broadcast queued for approval'
    },
    fa: {
      'a11y.skip': 'پرش به محتوا',
      'brand.tagline': 'مرکز فرماندهی',
      'overview.hintStars': 'ستاره تلگرام', 'overview.hintCredits': 'کردیت',
      'overview.hintAi': 'فراخوانی هوش مصنوعی ۲۴ ساعت: {n}', 'crm.funnelHint': 'جدید ← گرم ← موفق',
      'settings.langHint': 'فارسی/عربی کل رابط کاربری را راست‌چین می‌کنند.',
      'settings.themeHint': 'تم تاریک پیش‌فرض است؛ تم روشن همان رنگ‌ها را دارد.',
      'nav.overview': 'نمای کلی', 'nav.market': 'بازار', 'nav.orders': 'سفارش‌ها',
      'nav.wallets': 'کیف پول‌ها', 'nav.quests': 'ماموریت‌ها', 'nav.leaderboard': 'جدول امتیازها',
      'nav.bookings': 'رزروها', 'nav.owner': 'مالک', 'nav.settings': 'تنظیمات',
      'nav.crm': 'مدیریت سرنخ‌ها',
      'crm.subtitle': 'ورود، حذف تکراری‌ها و بستن سرنخ‌ها', 'crm.searchPh': 'جستجوی مخاطب، نام، شرکت…',
      'crm.addTitle': 'افزودن سریع', 'crm.importTitle': 'ورود JSON', 'crm.importHint': 'آرایه‌ای از {contact, name?, company?, stage?, score?, tags?} — تکراری‌ها رد می‌شوند.',
      'crm.importBtn': 'ورود', 'crm.addBtn': 'افزودن سرنخ', 'crm.contact': 'مخاطب', 'crm.stage': 'مرحله',
      'crm.name': 'نام', 'crm.lastTouch': 'آخرین تماس',
      'crm.source': 'منبع', 'crm.score': 'امتیاز', 'crm.stats.total': 'سرنخ‌ها', 'crm.stats.wonRate': 'نرخ برد',
      'crm.stats.fresh': 'جدید ۲۴ساعت', 'crm.empty': 'هنوز سرنخی نیست — اولین سرنخ را وارد یا اضافه کنید',
      'crm.imported': 'واردشده: {n}', 'crm.skipped': 'ردشده (تکراری): {n}', 'crm.invalid': 'ردیف نامعتبر: {n}', 'crm.stageAll': 'همه',
      'topbar.unlock': 'مالک', 'topbar.owner': 'مالک', 'topbar.live': 'زنده',
      'topbar.polling': 'بررسی دوره‌ای', 'topbar.offline': 'قطع',
      'common.cancel': 'انصراف', 'common.save': 'ذخیره', 'common.close': 'بستن',
      'common.error': 'خطایی رخ داد', 'common.prev': 'قبلی', 'common.next': 'بعدی',
      'common.retry': 'تلاش دوباره', 'common.showing': '{a}–{b} از {total}', 'common.empty': 'هنوز چیزی اینجا نیست',
      'status.paid': 'پرداخت‌شده', 'status.pending': 'در انتظار', 'status.delivered': 'تحویل‌شده',
      'status.new': 'جدید', 'status.warm': 'گرم', 'status.won': 'برد', 'status.lost': 'باخت',
      'status.refunded': 'بازپرداخت‌شده', 'status.cancelled': 'لغو‌شده', 'status.active': 'فعال',
      'status.archived': 'بایگانی', 'status.confirmed': 'تایید‌شده',
      'status.ok': 'موفق', 'status.denied': 'رد‌شده', 'status.error': 'خطا',
      'overview.subtitle': 'نمای زندهٔ ۲۴ ساعت گذشته',
      'overview.users': 'کاربران', 'overview.products': 'محصولات', 'overview.orders': 'سفارش‌ها',
      'overview.revenueStars': 'درآمد ⭐', 'overview.revenueCredits': 'درآمد 💎',
      'overview.pendingApprovals': 'تاییدهای در انتظار',
      'overview.chart': '۱۴ روز گذشته', 'overview.chartRevenue': 'درآمد', 'overview.chartOrders': 'سفارش‌ها',
      'overview.topProducts': 'محصولات برتر', 'overview.recentOrders': 'سفارش‌های اخیر',
      'overview.salesCount': 'فروش', 'overview.emptyChart': 'در ۱۴ روز گذشته فعالیتی نبوده',
      'market.subtitle': 'مرور کاتالوگ محصولات', 'market.searchPh': 'جستجوی محصولات…',
      'market.newProduct': 'محصول جدید', 'market.editProduct': 'ویرایش محصول',
      'market.title': 'عنوان', 'market.category': 'دسته', 'market.priceStars': 'قیمت ⭐ (ستاره)',
      'market.priceCredits': 'قیمت 💎 (اعتبار)', 'market.stock': 'موجودی',
      'market.stockHint': '‏-۱ = نامحدود', 'market.description': 'توضیحات',
      'market.featured': 'ویژه', 'market.active': 'فعال (نمایش در بازار)',
      'market.edit': 'ویرایش', 'market.archive': 'بایگانی',
      'market.confirmArchive': 'این محصول بایگانی شود؟ از بازار حذف خواهد شد.',
      'market.sales': 'فروش', 'market.unlimited': 'نامحدود', 'market.created': 'محصول ساخته شد',
      'market.empty': 'هنوز محصولی نیست', 'market.noResults': 'محصولی مطابق جستجو پیدا نشد',
      'orders.subtitle': 'چرخهٔ امانی هر فروش', 'orders.product': 'محصول',
      'orders.buyer': 'خریدار', 'orders.total': 'جمع', 'orders.status': 'وضعیت',
      'orders.date': 'تاریخ', 'orders.actions': 'عملیات', 'orders.deliver': 'تحویل',
      'orders.cancel': 'لغو', 'orders.refund': 'بازپرداخت',
      'orders.confirmDeliver': 'این سفارش به خریدار تحویل شود؟', 'orders.confirmCancel': 'این سفارش لغو و موجودی رزروشده آزاد شود؟',
      'orders.confirmRefund': 'این سفارش بازپرداخت شود؟ درخواست از تایید انسانی (HITL) می‌گذرد.',
      'orders.empty': 'سفارشی پیدا نشد', 'orders.all': 'همه',
      'wallets.subtitle': 'موجودی، مسدودی‌ها و حساب‌ها', 'wallets.wallets': 'کیف پول‌ها',
      'wallets.users': 'کاربران', 'wallets.balance': 'موجودی 💎', 'wallets.locked': 'مسدود',
      'wallets.credits': 'اعتبار', 'wallets.role': 'نقش', 'wallets.language': 'زبان',
      'wallets.joined': 'عضویت', 'wallets.user': 'کاربر', 'wallets.empty': 'هنوز حسابی نیست',
      'quests.subtitle': 'ماموریت‌های فعال دورهٔ جاری', 'quests.reward': 'جایزه',
      'quests.xp': 'امتیاز تجربه', 'quests.completed': 'تکمیل‌شده', 'quests.empty': 'ماموریتی موجود نیست',
      'quests.daily': 'روزانه', 'quests.weekly': 'هفتگی', 'quests.onetime': 'یک‌باره',
      'lb.subtitle': 'برترین‌ها در همهٔ زمینه‌ها', 'lb.xp': 'امتیاز', 'lb.sales': 'فروش', 'lb.ref': 'معرفی',
      'lb.unit.xp': 'XP', 'lb.unit.sales': 'فروش', 'lb.unit.ref': 'معرفی', 'lb.empty': 'هنوز موردی نیست',
      'bookings.subtitle': 'جلسات رزروشدهٔ پیش‌رو', 'bookings.user': 'کاربر',
      'bookings.slot': 'زمان', 'bookings.empty': 'رزرو پیش‌رویی وجود ندارد',
      'owner.subtitle': 'تاییدها، پیام همگانی، تنظیمات و امنیت',
      'owner.approvals': 'صف تایید', 'owner.approve': 'تایید', 'owner.reject': 'رد',
      'owner.notePrompt': 'یادداشت اختیاری برای تصمیم:', 'owner.noApprovals': 'صف تایید خالی است — همه‌چیز مرتب است ✨',
      'owner.expires': 'انقضا', 'owner.broadcast': 'پیام همگانی', 'owner.broadcastPh': 'پیام برای ارسال به همهٔ کاربران…',
      'owner.broadcastHint': 'پیام پیش از ارسال، برای تایید شما صف می‌شود (HITL).',
      'owner.send': 'افزودن به صف ارسال', 'owner.broadcastQueued': 'پیام همگانی برای تایید صف شد',
      'owner.settingsTitle': 'تنظیمات', 'owner.security': 'امنیت — ۱۵ لایه',
      'owner.audit': 'گزارش حسابرسی (آخرین)', 'owner.activeState': 'فعال', 'owner.inactiveState': 'غیرفعال',
      'owner.time': 'زمان', 'owner.actor': 'عامل', 'owner.action': 'اقدام', 'owner.target': 'هدف',
      'owner.statusCol': 'نتیجه', 'owner.value': 'مقدار', 'owner.keyTitle': 'کلید مالک',
      'owner.keyHint': 'فقط در همین مرورگر ذخیره می‌شود (localStorage). به‌عنوان هدر X-KIA-Key استفاده می‌شود.',
      'owner.saveKey': 'بازکردن', 'owner.clearKey': 'پاک‌کردن کلید', 'owner.keyPh': 'کلید مالک',
      'owner.unlockTitle': 'بازکردن حالت مالک', 'owner.unlockHint': 'کلید مالک داشبورد (DASHBOARD_KEY) را وارد کنید. فقط در همین مرورگر ذخیره می‌شود.',
      'locked.title': 'دسترسی مالک لازم است', 'locked.text': 'این بخش محافظت‌شده است. برای ادامه با کلید مالک بازش کنید.',
      'settings.subtitle': 'زبان، پوسته، کلید مالک و درباره',
      'settings.language': 'زبان', 'settings.theme': 'پوستهٔ تاریک', 'settings.dark': 'تاریک',
      'settings.light': 'روشن', 'settings.ownerKey': 'کلید مالک', 'settings.ownerKeyHint': 'با ذخیرهٔ کلید، زبانهٔ مالک و اقدامات مدیریتی باز می‌شود.',
      'settings.about': 'درباره', 'settings.version': 'نسخه', 'settings.uptime': 'آپ‌تایم',
      'settings.system': 'سرویس‌ها', 'settings.license': 'مجوز', 'settings.made': 'ساخته‌شده برای اپراتورهای کسب‌وکار تلگرام.',
      'toast.ownerRequired': 'کلید مالک لازم است', 'toast.error': 'درخواست ناموفق بود',
      'toast.saved': 'ذخیره شد', 'toast.done': 'انجام شد', 'toast.unlocked': 'حالت مالک باز شد',
      'toast.keyCleared': 'کلید مالک پاک شد', 'toast.keyInvalid': 'کلید مالک نامعتبر است',
      'toast.newApproval': 'تایید جدید در انتظار است', 'toast.paid': 'پرداخت دریافت شد',
      'toast.delivered': 'سفارش تحویل شد', 'toast.broadcastQueued': 'پیام همگانی برای تایید صف شد'
    },
    ru: {
      'a11y.skip': 'Перейти к содержимому',
      'brand.tagline': 'Центр управления',
      'overview.hintStars': 'Telegram Stars', 'overview.hintCredits': 'кредиты',
      'overview.hintAi': 'AI-вызовы 24ч: {n}', 'crm.funnelHint': 'новый → тёплый → сделка',
      'settings.langHint': 'FA / AR включают интерфейс RTL.',
      'settings.themeHint': 'Тёмная тема по умолчанию. Светлая — те же акценты.',
      'nav.overview': 'Обзор', 'nav.market': 'Маркет', 'nav.orders': 'Заказы',
      'nav.wallets': 'Кошельки', 'nav.quests': 'Квесты', 'nav.leaderboard': 'Рейтинг',
      'nav.bookings': 'Брони', 'nav.owner': 'Владелец', 'nav.settings': 'Настройки',
      'nav.crm': 'CRM',
      'crm.subtitle': 'Импорт, дедупликация и закрытие лидов', 'crm.searchPh': 'Поиск: контакт, имя, компания…',
      'crm.addTitle': 'Быстрое добавление', 'crm.importTitle': 'Импорт JSON', 'crm.importHint': 'Массив объектов {contact, name?, company?, stage?, score?, tags?} — дубликаты пропускаются.',
      'crm.importBtn': 'Импорт', 'crm.addBtn': 'Добавить лид', 'crm.contact': 'Контакт', 'crm.stage': 'Этап',
      'crm.name': 'Имя', 'crm.lastTouch': 'Касание',
      'crm.source': 'Источник', 'crm.score': 'Балл', 'crm.stats.total': 'Лиды', 'crm.stats.wonRate': 'Конверсия',
      'crm.stats.fresh': 'Новые 24ч', 'crm.empty': 'Лидов пока нет — импортируйте или добавьте первый',
      'crm.imported': 'Импортировано: {n}', 'crm.skipped': 'Пропущено (дубли): {n}', 'crm.invalid': 'Некорректных: {n}', 'crm.stageAll': 'Все',
      'topbar.unlock': 'Владелец', 'topbar.owner': 'Владелец', 'topbar.live': 'Онлайн',
      'topbar.polling': 'Опрос', 'topbar.offline': 'Нет связи',
      'common.cancel': 'Отмена', 'common.save': 'Сохранить', 'common.close': 'Закрыть',
      'common.error': 'Что-то пошло не так', 'common.prev': 'Назад', 'common.next': 'Далее',
      'common.retry': 'Повторить', 'common.showing': '{a}–{b} из {total}', 'common.empty': 'Пока ничего нет',
      'status.paid': 'Оплачен', 'status.pending': 'Ожидает', 'status.delivered': 'Доставлен',
      'status.new': 'Новый', 'status.warm': 'Тёплый', 'status.won': 'Выигран', 'status.lost': 'Проигран',
      'status.refunded': 'Возвращён', 'status.cancelled': 'Отменён', 'status.active': 'Активен',
      'status.archived': 'В архиве', 'status.confirmed': 'Подтверждён',
      'status.ok': 'OK', 'status.denied': 'Отказано', 'status.error': 'Ошибка',
      'overview.subtitle': 'Живой снимок за последние 24 часа',
      'overview.users': 'Пользователи', 'overview.products': 'Товары', 'overview.orders': 'Заказы',
      'overview.revenueStars': 'Выручка ⭐', 'overview.revenueCredits': 'Выручка 💎',
      'overview.pendingApprovals': 'Ожидают решения',
      'overview.chart': 'Последние 14 дней', 'overview.chartRevenue': 'Выручка', 'overview.chartOrders': 'Заказы',
      'overview.topProducts': 'Топ товаров', 'overview.recentOrders': 'Последние заказы',
      'overview.salesCount': 'продаж', 'overview.emptyChart': 'За 14 дней активности нет',
      'market.subtitle': 'Каталог товаров', 'market.searchPh': 'Поиск товаров…',
      'market.newProduct': 'Новый товар', 'market.editProduct': 'Изменить товар',
      'market.title': 'Название', 'market.category': 'Категория', 'market.priceStars': 'Цена ⭐ (звёзды)',
      'market.priceCredits': 'Цена 💎 (кредиты)', 'market.stock': 'Запас',
      'market.stockHint': '-1 = безлимит', 'market.description': 'Описание',
      'market.featured': 'Рекомендуемое', 'market.active': 'Активен (в продаже)',
      'market.edit': 'Изменить', 'market.archive': 'В архив',
      'market.confirmArchive': 'Архивировать товар? Он исчезнет из маркета.',
      'market.sales': 'продаж', 'market.unlimited': 'Безлимит', 'market.created': 'Товар создан',
      'market.empty': 'Товаров пока нет', 'market.noResults': 'Ничего не найдено',
      'orders.subtitle': 'Жизненный цикл каждой продажи', 'orders.product': 'Товар',
      'orders.buyer': 'Покупатель', 'orders.total': 'Сумма', 'orders.status': 'Статус',
      'orders.date': 'Дата', 'orders.actions': 'Действия', 'orders.deliver': 'Доставить',
      'orders.cancel': 'Отменить', 'orders.refund': 'Возврат',
      'orders.confirmDeliver': 'Доставить этот заказ покупателю?', 'orders.confirmCancel': 'Отменить заказ и вернуть зарезервированный запас?',
      'orders.confirmRefund': 'Оформить возврат? Заявка пройдёт ручное одобрение (HITL).',
      'orders.empty': 'Заказов не найдено', 'orders.all': 'Все',
      'wallets.subtitle': 'Балансы, заморозки и аккаунты', 'wallets.wallets': 'Кошельки',
      'wallets.users': 'Пользователи', 'wallets.balance': 'Баланс 💎', 'wallets.locked': 'Заморожено',
      'wallets.credits': 'Кредиты', 'wallets.role': 'Роль', 'wallets.language': 'Язык',
      'wallets.joined': 'С нами', 'wallets.user': 'Пользователь', 'wallets.empty': 'Аккаунтов пока нет',
      'quests.subtitle': 'Активные задания текущего периода', 'quests.reward': 'Награда',
      'quests.xp': 'Опыт', 'quests.completed': 'Завершено', 'quests.empty': 'Квестов нет',
      'quests.daily': 'Ежедневный', 'quests.weekly': 'Недельный', 'quests.onetime': 'Разовый',
      'lb.subtitle': 'Лучшие из лучших', 'lb.xp': 'Опыт', 'lb.sales': 'Продажи', 'lb.ref': 'Рефералы',
      'lb.unit.xp': 'XP', 'lb.unit.sales': 'продаж', 'lb.unit.ref': 'реф.', 'lb.empty': 'Пока пусто',
      'bookings.subtitle': 'Предстоящие сессии', 'bookings.user': 'Пользователь',
      'bookings.slot': 'Слот', 'bookings.empty': 'Броней нет',
      'owner.subtitle': 'Одобрения, рассылки, настройки и безопасность',
      'owner.approvals': 'Очередь одобрений', 'owner.approve': 'Одобрить', 'owner.reject': 'Отклонить',
      'owner.notePrompt': 'Заметка к решению (необязательно):', 'owner.noApprovals': 'Очередь пуста — всё чисто ✨',
      'owner.expires': 'истекает', 'owner.broadcast': 'Рассылка', 'owner.broadcastPh': 'Сообщение для всех пользователей…',
      'owner.broadcastHint': 'Рассылка попадёт в очередь на ваше одобрение (HITL).',
      'owner.send': 'В очередь', 'owner.broadcastQueued': 'Рассылка поставлена в очередь на одобрение',
      'owner.settingsTitle': 'Настройки', 'owner.security': 'Безопасность — 15 слоёв',
      'owner.audit': 'Журнал аудита (последние)', 'owner.activeState': 'активен', 'owner.inactiveState': 'выключен',
      'owner.time': 'Время', 'owner.actor': 'Актор', 'owner.action': 'Действие', 'owner.target': 'Цель',
      'owner.statusCol': 'Вердикт', 'owner.value': 'Значение', 'owner.keyTitle': 'Ключ владельца',
      'owner.keyHint': 'Хранится только в этом браузере (localStorage). Отправляется как заголовок X-KIA-Key.',
      'owner.saveKey': 'Открыть', 'owner.clearKey': 'Удалить ключ', 'owner.keyPh': 'Ключ владельца',
      'owner.unlockTitle': 'Режим владельца', 'owner.unlockHint': 'Вставьте ключ владельца (DASHBOARD_KEY). Он хранится только в этом браузере.',
      'locked.title': 'Требуется доступ владельца', 'locked.text': 'Раздел защищён. Откройте его ключом владельца.',
      'settings.subtitle': 'Язык, тема, ключ владельца и о программе',
      'settings.language': 'Язык', 'settings.theme': 'Тёмная тема', 'settings.dark': 'Тёмная',
      'settings.light': 'Светлая', 'settings.ownerKey': 'Ключ владельца', 'settings.ownerKeyHint': 'Сохраните ключ, чтобы открыть вкладку «Владелец» и действия управления.',
      'settings.about': 'О программе', 'settings.version': 'Версия', 'settings.uptime': 'Аптайм',
      'settings.system': 'Сервисы', 'settings.license': 'Лицензия', 'settings.made': 'Создано для операторов Telegram-бизнеса.',
      'toast.ownerRequired': 'Нужен ключ владельца', 'toast.error': 'Запрос не удался',
      'toast.saved': 'Сохранено', 'toast.done': 'Готово', 'toast.unlocked': 'Режим владельца открыт',
      'toast.keyCleared': 'Ключ владельца удалён', 'toast.keyInvalid': 'Неверный ключ владельца',
      'toast.newApproval': 'Новое одобрение ожидает', 'toast.paid': 'Получена оплата',
      'toast.delivered': 'Заказ доставлен', 'toast.broadcastQueued': 'Рассылка в очереди на одобрение'
    },
    ar: {
      'a11y.skip': 'الانتقال إلى المحتوى',
      'brand.tagline': 'مركز القيادة',
      'overview.hintStars': 'نجوم تيليجرام', 'overview.hintCredits': 'كريدت',
      'overview.hintAi': 'نداءات الذكاء 24س: {n}', 'crm.funnelHint': 'جديد ← دافئ ← ناجح',
      'settings.langHint': 'الفارسية/العربية تفعّل واجهة RTL.',
      'settings.themeHint': 'الداكن هو الافتراضي؛ الفاتح بنفس الألوان.',
      'nav.overview': 'نظرة عامة', 'nav.market': 'السوق', 'nav.orders': 'الطلبات',
      'nav.wallets': 'المحافظ', 'nav.quests': 'المهام', 'nav.leaderboard': 'لوحة الصدارة',
      'nav.bookings': 'الحجوزات', 'nav.owner': 'المالك', 'nav.settings': 'الإعدادات',
      'nav.crm': 'إدارة العملاء',
      'crm.subtitle': 'استورد العملاء المحتملين وأزل التكرار وأغلقهم', 'crm.searchPh': 'بحث: جهة اتصال، اسم، شركة…',
      'crm.addTitle': 'إضافة سريعة', 'crm.importTitle': 'استيراد JSON', 'crm.importHint': 'مصفوفة من {contact, name?, company?, stage?, score?, tags?} — يتم تخطي التكرارات.',
      'crm.importBtn': 'استيراد', 'crm.addBtn': 'إضافة عميل', 'crm.contact': 'جهة الاتصال', 'crm.stage': 'المرحلة',
      'crm.name': 'الاسم', 'crm.lastTouch': 'آخر تواصل',
      'crm.source': 'المصدر', 'crm.score': 'النقاط', 'crm.stats.total': 'العملاء', 'crm.stats.wonRate': 'معدل الفوز',
      'crm.stats.fresh': 'جديد 24س', 'crm.empty': 'لا يوجد عملاء بعد — استورد أو أضف أول عميل',
      'crm.imported': 'المستورد: {n}', 'crm.skipped': 'تم تخطيه (مكرر): {n}', 'crm.invalid': 'صفوف غير صالحة: {n}', 'crm.stageAll': 'الكل',
      'topbar.unlock': 'المالك', 'topbar.owner': 'المالك', 'topbar.live': 'مباشر',
      'topbar.polling': 'استقصاء', 'topbar.offline': 'غير متصل',
      'common.cancel': 'إلغاء', 'common.save': 'حفظ', 'common.close': 'إغلاق',
      'common.error': 'حدث خطأ ما', 'common.prev': 'السابق', 'common.next': 'التالي',
      'common.retry': 'إعادة المحاولة', 'common.showing': '{a}–{b} من {total}', 'common.empty': 'لا يوجد شيء بعد',
      'status.paid': 'مدفوع', 'status.pending': 'قيد الانتظار', 'status.delivered': 'تم التسليم',
      'status.new': 'جديد', 'status.warm': 'دافئ', 'status.won': 'فوز', 'status.lost': 'خسارة',
      'status.refunded': 'مسترد', 'status.cancelled': 'ملغى', 'status.active': 'نشط',
      'status.archived': 'مؤرشف', 'status.confirmed': 'مؤكد',
      'status.ok': 'ناجح', 'status.denied': 'مرفوض', 'status.error': 'خطأ',
      'overview.subtitle': 'لمحة حية لآخر ٢٤ ساعة',
      'overview.users': 'المستخدمون', 'overview.products': 'المنتجات', 'overview.orders': 'الطلبات',
      'overview.revenueStars': 'الإيرادات ⭐', 'overview.revenueCredits': 'الإيرادات 💎',
      'overview.pendingApprovals': 'الموافقات المعلقة',
      'overview.chart': 'آخر ١٤ يومًا', 'overview.chartRevenue': 'الإيرادات', 'overview.chartOrders': 'الطلبات',
      'overview.topProducts': 'أفضل المنتجات', 'overview.recentOrders': 'أحدث الطلبات',
      'overview.salesCount': 'مبيعة', 'overview.emptyChart': 'لا نشاط في آخر ١٤ يومًا',
      'market.subtitle': 'تصفح كتالوج المنتجات', 'market.searchPh': 'ابحث في المنتجات…',
      'market.newProduct': 'منتج جديد', 'market.editProduct': 'تعديل المنتج',
      'market.title': 'العنوان', 'market.category': 'الفئة', 'market.priceStars': 'السعر ⭐ (نجوم)',
      'market.priceCredits': 'السعر 💎 (قروض)', 'market.stock': 'المخزون',
      'market.stockHint': '‏-١ = غير محدود', 'market.description': 'الوصف',
      'market.featured': 'مميز', 'market.active': 'نشط (معروض)',
      'market.edit': 'تعديل', 'market.archive': 'أرشفة',
      'market.confirmArchive': 'أرشفة هذا المنتج؟ سيختفي من السوق.',
      'market.sales': 'مبيعة', 'market.unlimited': 'غير محدود', 'market.created': 'تم إنشاء المنتج',
      'market.empty': 'لا منتجات بعد', 'market.noResults': 'لا نتائج مطابقة للبحث',
      'orders.subtitle': 'دورة الضمان لكل عملية بيع', 'orders.product': 'المنتج',
      'orders.buyer': 'المشتري', 'orders.total': 'الإجمالي', 'orders.status': 'الحالة',
      'orders.date': 'التاريخ', 'orders.actions': 'إجراءات', 'orders.deliver': 'تسليم',
      'orders.cancel': 'إلغاء', 'orders.refund': 'استرداد',
      'orders.confirmDeliver': 'تسليم هذا الطلب للمشتري؟', 'orders.confirmCancel': 'إلغاء هذا الطلب وتحرير المخزون المحجوز؟',
      'orders.confirmRefund': 'استرداد هذا الطلب؟ يمر الطلب عبر موافقة بشرية (HITL).',
      'orders.empty': 'لا طلبات', 'orders.all': 'الكل',
      'wallets.subtitle': 'الأرصدة والحجوزات والحسابات', 'wallets.wallets': 'المحافظ',
      'wallets.users': 'المستخدمون', 'wallets.balance': 'الرصيد 💎', 'wallets.locked': 'محجوز',
      'wallets.credits': 'القروض', 'wallets.role': 'الدور', 'wallets.language': 'اللغة',
      'wallets.joined': 'انضم', 'wallets.user': 'المستخدم', 'wallets.empty': 'لا حسابات بعد',
      'quests.subtitle': 'المهام النشطة للفترة الحالية', 'quests.reward': 'المكافأة',
      'quests.xp': 'خبرة', 'quests.completed': 'مكتملة', 'quests.empty': 'لا مهام متاحة',
      'quests.daily': 'يومية', 'quests.weekly': 'أسبوعية', 'quests.onetime': 'لمرة واحدة',
      'lb.subtitle': 'الأفضل على الإطلاق', 'lb.xp': 'الخبرة', 'lb.sales': 'المبيعات', 'lb.ref': 'الإحالات',
      'lb.unit.xp': 'XP', 'lb.unit.sales': 'مبيعة', 'lb.unit.ref': 'إحالة', 'lb.empty': 'لا إدخالات بعد',
      'bookings.subtitle': 'الجلسات القادمة', 'bookings.user': 'المستخدم',
      'bookings.slot': 'الموعد', 'bookings.empty': 'لا حجوزات قادمة',
      'owner.subtitle': 'الموافقات، البث، الإعدادات والأمان',
      'owner.approvals': 'قائمة الموافقات', 'owner.approve': 'موافقة', 'owner.reject': 'رفض',
      'owner.notePrompt': 'ملاحظة اختيارية للقرار:', 'owner.noApprovals': 'القائمة فارغة — كل شيء سليم ✨',
      'owner.expires': 'ينتهي', 'owner.broadcast': 'بث جماعي', 'owner.broadcastPh': 'رسالة لإرسالها لجميع المستخدمين…',
      'owner.broadcastHint': 'يدخل البث قائمة انتظار موافقتك (HITL) قبل الإرسال.',
      'owner.send': 'إضافة لقائمة الإرسال', 'owner.broadcastQueued': 'تم إدراج البث في قائمة انتظار الموافقة',
      'owner.settingsTitle': 'الإعدادات', 'owner.security': 'الأمان — ١٥ طبقة',
      'owner.audit': 'سجل التدقيق (الأحدث)', 'owner.activeState': 'نشطة', 'owner.inactiveState': 'معطلة',
      'owner.time': 'الوقت', 'owner.actor': 'الفاعل', 'owner.action': 'الإجراء', 'owner.target': 'الهدف',
      'owner.statusCol': 'الحكم', 'owner.value': 'القيمة', 'owner.keyTitle': 'مفتاح المالك',
      'owner.keyHint': 'يُخزن في هذا المتصفح فقط (localStorage). يُستخدم كترويسة X-KIA-Key.',
      'owner.saveKey': 'فتح', 'owner.clearKey': 'مسح المفتاح', 'owner.keyPh': 'مفتاح المالك',
      'owner.unlockTitle': 'فتح وضع المالك', 'owner.unlockHint': 'الصق مفتاح المالك للوحة (DASHBOARD_KEY). يُخزن في هذا المتصفح فقط.',
      'locked.title': 'مطلوب وصول المالك', 'locked.text': 'هذا القسم محمي. افتحه بمفتاح المالك للمتابعة.',
      'settings.subtitle': 'اللغة، المظهر، مفتاح المالك وحول',
      'settings.language': 'اللغة', 'settings.theme': 'المظهر الداكن', 'settings.dark': 'داكن',
      'settings.light': 'فاتح', 'settings.ownerKey': 'مفتاح المالك', 'settings.ownerKeyHint': 'احفظ المفتاح لفتح تبويب المالك وإجراءات الإدارة.',
      'settings.about': 'حول', 'settings.version': 'الإصدار', 'settings.uptime': 'وقت التشغيل',
      'settings.system': 'الخدمات', 'settings.license': 'الترخيص', 'settings.made': 'صُنع لمشغلي أعمال تيليجرام.',
      'toast.ownerRequired': 'مطلوب مفتاح المالك', 'toast.error': 'فشل الطلب',
      'toast.saved': 'تم الحفظ', 'toast.done': 'تم', 'toast.unlocked': 'تم فتح وضع المالك',
      'toast.keyCleared': 'تم مسح مفتاح المالك', 'toast.keyInvalid': 'مفتاح المالك غير صالح',
      'toast.newApproval': 'موافقة جديدة تنتظرك', 'toast.paid': 'تم استلام دفعة',
      'toast.delivered': 'تم تسليم الطلب', 'toast.broadcastQueued': 'تم إدراج البث في قائمة انتظار الموافقة'
    }
  };
  const RTL_LANGS = ['fa', 'ar'];

  /* ─────────────────────────── state ─────────────────────────── */
  const state = {
    lang: localStorage.getItem('kia_lang') || 'en',
    theme: localStorage.getItem('kia_theme') || 'dark',
    key: localStorage.getItem('kia_key') || '',
    route: 'overview',
    health: null,
    brand: null,
    chartMetric: 'revenue',
    market: { q: '', page: 0, limit: 12, total: 0, editing: null, formOpen: false },
    orders: { status: 'all', offset: 0, limit: 10, total: 0 },
    crm: { stage: 'all', offset: 0, limit: 10, total: 0 },
    walletsTab: 'wallets',
    lbType: 'xp'
  };

  const ROUTES = ['overview', 'market', 'orders', 'wallets', 'quests', 'leaderboard', 'bookings', 'crm', 'owner', 'settings'];
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.prototype.slice.call((el || document).querySelectorAll(sel));

  /* ─────────────────────────── tiny utils ─────────────────────────── */
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC_MAP[c]); }
  function t(key) {
    const d = I18N[state.lang] || I18N.en;
    return (d && d[key]) || I18N.en[key] || key;
  }
  function tf(key, params) {
    let s = t(key);
    Object.keys(params || {}).forEach((k) => { s = s.split('{' + k + '}').join(String(params[k])); });
    return s;
  }
  const nfCache = {};
  function nf(opts) {
    const k = state.lang + '|' + JSON.stringify(opts || {});
    if (!nfCache[k]) {
      try { nfCache[k] = new Intl.NumberFormat(state.lang, opts); }
      catch (e) { nfCache[k] = new Intl.NumberFormat('en', opts); }
    }
    return nfCache[k];
  }
  function fmtInt(n) { const v = Number(n); return nf().format(isFinite(v) ? v : 0); }
  function fmtCompact(n) {
    const v = Number(n) || 0;
    try { return nf({ notation: 'compact', maximumFractionDigits: 1 }).format(v); }
    catch (e) { return fmtInt(v); }
  }
  function fmtMoneyStars(n) { return '⭐ ' + fmtInt(n); }
  function fmtMoneyCredits(n) { return '💎 ' + fmtInt(n); }
  function fmtTotal(stars, credits) {
    const parts = [];
    if (Number(stars) > 0) parts.push(fmtMoneyStars(stars));
    if (Number(credits) > 0) parts.push(fmtMoneyCredits(credits));
    return parts.length ? parts.join(' + ') : '—';
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try { return new Intl.DateTimeFormat(state.lang, { year: 'numeric', month: 'short', day: 'numeric' }).format(d); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat(state.lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
    } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  function fmtUptime(sec) {
    const s = Number(sec) || 0;
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }
  function shortId(id) {
    const s = String(id || '');
    return s.length > 10 ? '…' + s.slice(-8) : (s || '—');
  }
  function debounce(fn, ms) {
    let timer = null;
    return function () { const args = arguments; clearTimeout(timer); timer = setTimeout(() => fn.apply(null, args), ms); };
  }
  function personName(o) {
    if (!o) return '—';
    if (typeof o === 'string') return o;
    return o.name || o.title || o.username || '—';
  }

  /* ─────────────────────────── toasts ─────────────────────────── */
  const TOAST_ICONS = {
    success: '<svg class="toast-ico" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg class="toast-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    warn: '<svg class="toast-ico" viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>',
    info: '<svg class="toast-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
  };
  function toast(msg, type) {
    const box = $('#toasts');
    if (!box) return;
    const kind = TOAST_ICONS[type] ? type : 'info';
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = TOAST_ICONS[kind] +
      '<div class="toast-msg">' + esc(msg) + '</div>' +
      '<button type="button" class="toast-close" aria-label="' + esc(t('common.close')) + '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    const kill = () => {
      if (!el.parentNode) return;
      el.classList.add('leaving');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    };
    $('.toast-close', el).addEventListener('click', kill);
    box.appendChild(el);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(kill, 4200);
  }

  /* ─────────────────────────── API wrapper ─────────────────────────── */
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.key) headers['X-KIA-Key'] = state.key;
    let res, json = null;
    try {
      res = await fetch('/api/v1' + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store'
      });
      try { json = await res.json(); } catch (e) { json = null; }
    } catch (e) {
      if (!opts.silent) toast(t('toast.error') + ' (network)', 'error');
      return { ok: false, error: 'network', status: 0 };
    }
    if (res.status === 401) {
      if (!opts.silent) toast(t('toast.ownerRequired'), 'warn');
      return { ok: false, error: 'unauthorized', status: 401 };
    }
    if (!res.ok || !json || json.ok !== true) {
      const err = (json && json.error) || 'internal';
      if (!opts.silent) toast(t('toast.error') + ' — ' + err, 'error');
      return { ok: false, error: err, status: res.status };
    }
    return { ok: true, data: json.data };
  }
  async function fetchHealth() {
    try {
      const res = await fetch('/healthz', { cache: 'no-store' });
      let j = null; try { j = await res.json(); } catch (e) { j = null; }
      state.health = (j && typeof j === 'object' && j.data) ? j.data : j;
      const v = state.health && state.health.version;
      const fv = $('#foot-version');
      if (fv && v) fv.textContent = String(v);
    } catch (e) { /* offline — footer keeps placeholder */ }
  }
  /* White-label: rebrand the shell from GET /api/v1/brand (env → live settings). */
  async function fetchBrand() {
    try {
      const res = await fetch('/api/v1/brand', { cache: 'no-store' });
      const j = await res.json();
      if (j && j.ok && j.data && j.data.name) {
        state.brand = j.data;
        const name = String(j.data.name);
        document.querySelectorAll('.topbar-name, .brand-text strong').forEach((el) => { el.textContent = name; });
        if (j.data.tagline) {
          const tag = document.querySelector('.brand-text small');
          if (tag) tag.textContent = String(j.data.tagline);
        }
        const foot = document.querySelector('.foot-text');
        if (foot) foot.firstChild.nodeValue = name + ' · ';
        document.title = t('nav.' + state.route) + ' · ' + name;
      }
    } catch (e) { /* keep default branding */ }
  }

  /* ─────────────────────────── shared renderers ─────────────────────────── */
  const skeletonGrid = () => '<div class="skeleton-grid" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  const skeletonLines = () => '<div class="skeleton-lines" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
  function emptyState(icon, titleKey, subKey) {
    return '<div class="empty"><div class="empty-ico" aria-hidden="true">' + icon + '</div>' +
      '<b>' + esc(t(titleKey)) + '</b>' +
      (subKey ? '<span>' + esc(t(subKey)) + '</span>' : '') + '</div>';
  }
  function errorState() {
    return '<div class="empty"><div class="empty-ico" aria-hidden="true">⚠️</div>' +
      '<b>' + esc(t('common.error')) + '</b>' +
      '<button type="button" class="btn btn-ghost" data-action="retry">' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 4v5h-5"/></svg>' +
      '<span>' + esc(t('common.retry')) + '</span></button></div>';
  }
  function lockedPanel() {
    return '<div class="locked-panel">' +
      '<span class="lock-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4.2" y="10.4" width="15.6" height="10.4" rx="2.4"/><path d="M8 10.4V7.6a4 4 0 0 1 7.8-1.2"/></svg></span>' +
      '<b>' + esc(t('locked.title')) + '</b><span>' + esc(t('locked.text')) + '</span>' +
      '<button type="button" class="btn btn-primary" data-action="open-unlock">' +
      '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.2" y="10.4" width="15.6" height="10.4" rx="2.4"/><path d="M8 10.4V7.6a4 4 0 0 1 7.8-1.2"/><circle cx="12" cy="15.4" r="1.4"/></svg>' +
      '<span>' + esc(t('topbar.unlock')) + '</span></button></div>';
  }
  function statusChip(status) {
    const s = String(status || 'pending');
    const cls = { paid: 'c-paid', pending: 'c-pending', delivered: 'c-delivered', refunded: 'c-refunded', cancelled: 'c-cancelled', active: 'c-active', archived: 'c-archived', confirmed: 'c-paid', ok: 'ok', denied: 'danger', error: 'warn', new: 'c-pending', warm: 'c-active', won: 'c-paid', lost: 'c-refunded' }[s] || '';
    const key = 'status.' + s;
    return '<span class="chip ' + cls + '">' + esc(t(key) === key ? s : t(key)) + '</span>';
  }
  function roleBadge(role) {
    const r = String(role || 'user');
    return '<span class="role-badge ' + esc(r) + '">' + esc(r) + '</span>';
  }
  function userCell(name, username) {
    return '<div class="cell-main">' + esc(name || '—') + '</div>' +
      (username ? '<div class="cell-sub">@' + esc(username) + '</div>' : '');
  }
  function pager(scope, offset, limit, total) {
    const page = Math.floor(offset / limit) + 1;
    const last = Math.max(1, Math.ceil(total / limit));
    return '<div class="table-foot"><span>' + esc(tf('common.showing', {
      a: fmtInt(total === 0 ? 0 : offset + 1),
      b: fmtInt(Math.min(offset + limit, total)),
      total: fmtInt(total)
    })) + '</span><div class="btn-row">' +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="page-prev" data-scope="' + scope + '"' + (page <= 1 ? ' disabled' : '') + '>' + esc(t('common.prev')) + '</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="page-next" data-scope="' + scope + '"' + (page >= last ? ' disabled' : '') + '>' + esc(t('common.next')) + '</button>' +
      '</div></div>';
  }
  function body(section) { return $('[data-body]', $('#view-' + section)); }

  /* ─────────────────────────── router ─────────────────────────── */
  function parseRoute() {
    const h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.indexOf(h) >= 0 ? h : 'overview';
  }
  function onRoute() {
    let route = parseRoute();
    if (route === 'owner' && !state.key) {
      openKeyModal();
      if (location.hash !== '#/overview') { location.hash = '#/overview'; return; }
      route = 'overview';
    }
    state.route = route;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + route; });
    $$('.nav-item').forEach((a) => {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = t('nav.' + route) + ' · ' + (state.brand && state.brand.name ? state.brand.name : 'KIA DropAgentX');
    const loader = LOADERS[route];
    if (loader) loader(false);
    window.scrollTo(0, 0);
  }

  /* ═══════════════════════════ OVERVIEW ═══════════════════════════ */
  function kpiCard(labelKey, valueHtml, opts) {
    opts = opts || {};
    return '<div class="card kpi' + (opts.mod ? ' ' + opts.mod : '') + '">' +
      '<div class="kpi-label">' + (opts.icon ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + opts.icon + '</svg>' : '') +
      esc(t(labelKey)) + '</div>' +
      '<div class="kpi-value">' + valueHtml + '</div>' +
      (opts.hint ? '<div class="kpi-hint">' + esc(opts.hint) + '</div>' : '') +
      '</div>';
  }
  function chartSVG(series, metric) {
    const W = 720, H = 250, padL = 46, padR = 16, padT = 16, padB = 30;
    const data = (series || []).map((s) => ({ date: s.date || '', v: Number(metric === 'orders' ? s.orders : s.revenue) || 0 }));
    if (!data.length) return emptyState('📈', 'overview.emptyChart');
    const max = Math.max(1, Math.max.apply(null, data.map((d) => d.v)));
    const iw = W - padL - padR, ih = H - padT - padB;
    const x = (i) => padL + (data.length === 1 ? iw / 2 : (i * iw / (data.length - 1)));
    const y = (v) => padT + ih - (v / max) * ih;
    const gid = 'grad-' + metric;
    let line = '', dots = '';
    data.forEach((d, i) => {
      line += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(d.v).toFixed(1);
      dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(d.v).toFixed(1) + '" r="3.4" fill="' +
        (metric === 'orders' ? '#8b5cf6' : '#34d399') + '" stroke="#070a12" stroke-width="1.5">' +
        '<title>' + esc(d.date + ' — ' + fmtInt(d.v)) + '</title></circle>';
    });
    const area = line + ' L' + x(data.length - 1).toFixed(1) + ',' + (padT + ih).toFixed(1) +
      ' L' + padL + ',' + (padT + ih).toFixed(1) + ' Z';
    let grid = '';
    for (let k = 0; k <= 4; k++) {
      const gy = (padT + ih - (ih * k / 4)).toFixed(1);
      const val = fmtCompact(max * k / 4);
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#242b3d" stroke-width="1" stroke-dasharray="3 5" opacity="0.55"/>' +
        '<text x="' + (padL - 8) + '" y="' + (Number(gy) + 4) + '" text-anchor="end" font-size="10.5" fill="#8b93a7">' + esc(val) + '</text>';
    }
    let xlabels = '';
    const step = data.length > 8 ? 2 : 1;
    const locDigits = (v) => {
      const s = String(v);
      if (state.lang === 'fa') return s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
      if (state.lang === 'ar') return s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
      return s;
    };
    data.forEach((d, i) => {
      if (i % step !== 0 && i !== data.length - 1) return;
      const lbl = d.date.length >= 10 ? d.date.slice(8, 10) + '.' + d.date.slice(5, 7) : d.date;
      xlabels += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="#8b93a7">' + esc(locDigits(lbl)) + '</text>';
    });
    const stroke = metric === 'orders' ? '#8b5cf6' : '#34d399';
    const stop1 = metric === 'orders' ? '139,92,246' : '52,211,153';
    return '<div class="chart-wrap"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(t(metric === 'orders' ? 'overview.chartOrders' : 'overview.chartRevenue')) + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="rgba(' + stop1 + ',0.34)"/><stop offset="1" stop-color="rgba(' + stop1 + ',0)"/></linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      dots + xlabels + '</svg></div>';
  }
  async function loadOverview(opts) {
    opts = opts || {};
    const el = body('overview');
    if (!el) return;
    if (!opts.silent) el.innerHTML = skeletonGrid() + '<div style="height:14px"></div>' + skeletonLines();
    const res = await api('/overview', { silent: !!opts.silent });
    if (state.route !== 'overview') return;
    if (!res.ok) {
      el.innerHTML = res.error === 'unauthorized' ? lockedPanel() : errorState();
      return;
    }
    const d = res.data || {};
    const kpis =
      kpiCard('overview.users', fmtInt(d.users), { icon: '<path d="M17 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20"/><circle cx="10" cy="7.6" r="3.6"/><path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.6 4.2a3.6 3.6 0 0 1 0 6.8"/>' }) +
      kpiCard('overview.products', fmtInt(d.products), { icon: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3.4 13.4A2 2 0 0 1 2.8 12V4.8A2 2 0 0 1 4.8 2.8H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.8Z"/><circle cx="8" cy="8" r="1.4"/>' }) +
      kpiCard('overview.orders', fmtInt(d.orders), { icon: '<path d="M6 2.8h12a1 1 0 0 1 1 1V21l-3-2-2 2-2-2-2 2-2-2-3 2V3.8a1 1 0 0 1 1-1Z"/>' }) +
      kpiCard('overview.revenueStars', fmtInt(d.revenueStars), { mod: 'kpi-amber', hint: t('overview.hintStars') }) +
      kpiCard('overview.revenueCredits', fmtInt(d.revenueCredits), { mod: 'kpi-green', hint: t('overview.hintCredits') }) +
      kpiCard('overview.pendingApprovals', fmtInt(d.pendingApprovals), { mod: d.pendingApprovals > 0 ? 'kpi-warn kpi-amber' : '', hint: d.aiCalls != null ? tf('overview.hintAi', { n: fmtInt(d.aiCalls) }) : '' });
    const metric = state.chartMetric;
    const chartCard = '<div class="card chart-card"><div class="chart-head"><h2>' + esc(t('overview.chart')) + '</h2>' +
      '<div class="chip-row" role="group" aria-label="Metric">' +
      '<button type="button" class="chip-btn" data-action="chart-metric" data-metric="revenue" aria-pressed="' + (metric === 'revenue') + '">' + esc(t('overview.chartRevenue')) + '</button>' +
      '<button type="button" class="chip-btn" data-action="chart-metric" data-metric="orders" aria-pressed="' + (metric === 'orders') + '">' + esc(t('overview.chartOrders')) + '</button>' +
      '</div></div>' + chartSVG(d.series, metric) + '</div>';
    const top = (d.topProducts || []);
    const maxSales = Math.max(1, Math.max.apply(null, top.map((p) => Number(p.salesCount) || 0)));
    const topCard = '<div class="card"><h2 style="margin-block-end:10px">' + esc(t('overview.topProducts')) + '</h2>' +
      (top.length
        ? '<div class="rank-list">' + top.map((p, i) =>
          '<div class="rank-row"><span class="rank-num">' + (i + 1) + '</span>' +
          '<span class="rank-title" title="' + esc(p.title) + '">' + esc(p.title || '—') + '</span>' +
          '<span class="chip">' + fmtInt(p.salesCount) + ' ' + esc(t('overview.salesCount')) + '</span>' +
          '<span class="rank-bar"><i style="width:' + Math.round((Number(p.salesCount) || 0) / maxSales * 100) + '%"></i></span></div>'
        ).join('') + '</div>'
        : emptyState('📦', 'market.empty')) + '</div>';
    const ro = (d.recentOrders || []);
    const recentCard = '<div class="card table-card"><div class="table-scroll"><table class="tbl">' +
      '<thead><tr><th>' + esc(t('orders.product')) + '</th><th>' + esc(t('orders.buyer')) + '</th><th class="num">' + esc(t('orders.total')) + '</th><th>' + esc(t('orders.status')) + '</th><th>' + esc(t('orders.date')) + '</th></tr></thead><tbody>' +
      (ro.length ? ro.map((o) =>
        '<tr><td><div class="cell-main" title="' + esc(o.title) + '">' + esc(o.title || '—') + '</div><div class="cell-sub mono">' + esc(shortId(o.id)) + '</div></td>' +
        '<td>' + esc(personName(o.buyer)) + '</td>' +
        '<td class="num">' + esc(fmtTotal(o.totalStars, o.totalCredits)) + '</td>' +
        '<td>' + statusChip(o.status) + '</td>' +
        '<td class="cell-sub">' + esc(fmtDate(o.createdAt)) + '</td></tr>'
      ).join('') : '<tr><td colspan="5">' + emptyState('🧾', 'orders.empty') + '</td></tr>') +
      '</tbody></table></div></div>';
    el.innerHTML =
      '<div class="kpi-grid">' + kpis + '</div>' +
      '<div class="overview-cols"><div class="overview-col">' + chartCard + '</div>' +
      '<div class="overview-col">' + topCard + '</div></div>' +
      '<div style="height:14px"></div>' + recentCard;
  }

  /* ═══════════════════════════ MARKET ═══════════════════════════ */
  function productPriceRow(p) {
    let html = '';
    if (Number(p.priceStars) > 0) html += '<span class="price stars">⭐ ' + fmtInt(p.priceStars) + '</span>';
    if (Number(p.priceCredits) > 0) html += '<span class="price credits">💎 ' + fmtInt(p.priceCredits) + '</span>';
    return html || '<span class="price">—</span>';
  }
  function productCard(p, isEditing) {
    if (isEditing) return productEditCard(p);
    const stock = Number(p.stock);
    const stockTxt = stock < 0 ? t('market.unlimited') : fmtInt(stock);
    const stockCls = stock >= 0 && stock <= 5 ? ' stock-low' : '';
    const ownerActions = !!state.key;
    return '<article class="card product-card hoverable" data-id="' + esc(p.id) + '">' +
      '<div class="product-top"><div class="product-title">' + esc(p.title || '—') + '</div>' +
      '<div class="chip-row">' +
      (p.featured ? '<span class="chip c-delivered">★</span>' : '') +
      '<span class="chip">' + esc(p.category || 'general') + '</span></div></div>' +
      (p.description ? '<div class="product-desc">' + esc(p.description) + '</div>' : '') +
      '<div class="price-row">' + productPriceRow(p) + '</div>' +
      '<div class="stock-line"><span class="' + stockCls.trim() + '">📦 ' + esc(t('market.stock')) + ': ' + esc(stockTxt) + '</span>' +
      '<span>·</span><span>' + fmtInt(p.salesCount) + ' ' + esc(t('market.sales')) + '</span></div>' +
      (ownerActions
        ? '<div class="product-foot"><span>' + statusChip(p.status) + '</span>' +
          '<div class="btn-row"><button type="button" class="btn btn-sm btn-violet-ghost" data-action="product-edit" data-id="' + esc(p.id) + '">' + esc(t('market.edit')) + '</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-action="product-archive" data-id="' + esc(p.id) + '">' + esc(t('market.archive')) + '</button></div></div>'
        : '') +
      '</article>';
  }
  function productFormFields(p) {
    p = p || {};
    return '<div class="form-grid">' +
      '<div class="field"><label for="pf-title">' + esc(t('market.title')) + ' *</label><input class="input" id="pf-title" name="title" required maxlength="120" value="' + esc(p.title || '') + '"></div>' +
      '<div class="field"><label for="pf-cat">' + esc(t('market.category')) + '</label><input class="input" id="pf-cat" name="category" maxlength="40" value="' + esc(p.category || 'general') + '"></div>' +
      '<div class="field"><label for="pf-stars">' + esc(t('market.priceStars')) + '</label><input class="input" id="pf-stars" name="priceStars" type="number" min="0" step="1" value="' + esc(p.priceStars != null ? p.priceStars : 0) + '"></div>' +
      '<div class="field"><label for="pf-credits">' + esc(t('market.priceCredits')) + '</label><input class="input" id="pf-credits" name="priceCredits" type="number" min="0" step="1" value="' + esc(p.priceCredits != null ? p.priceCredits : 0) + '"></div>' +
      '<div class="field"><label for="pf-stock">' + esc(t('market.stock')) + '</label><input class="input" id="pf-stock" name="stock" type="number" step="1" value="' + esc(p.stock != null ? p.stock : -1) + '"><span class="cell-sub">' + esc(t('market.stockHint')) + '</span></div>' +
      '<label class="check-field"><input type="checkbox" name="featured"' + (p.featured ? ' checked' : '') + '> ' + esc(t('market.featured')) + '</label>' +
      (p.id ? '<label class="check-field"><input type="checkbox" name="active"' + (p.status === 'active' ? ' checked' : '') + '> ' + esc(t('market.active')) + '</label>' : '') +
      '</div>' +
      '<div class="field" style="margin-block-start:12px"><label for="pf-desc">' + esc(t('market.description')) + '</label><textarea class="input" id="pf-desc" name="description" maxlength="800" rows="2">' + esc(p.description || '') + '</textarea></div>';
  }
  function productNewCard() {
    return '<div class="card" id="new-product-card"><h2 style="margin-block-end:12px">' + esc(t('market.newProduct')) + '</h2>' +
      '<form data-form="product-new" novalidate>' + productFormFields(null) +
      '<div class="btn-row" style="margin-block-start:14px"><button type="submit" class="btn btn-primary">' + esc(t('common.save')) + '</button>' +
      '<button type="button" class="btn btn-ghost" data-action="product-cancel-new">' + esc(t('common.cancel')) + '</button></div></form></div>';
  }
  function productEditCard(p) {
    return '<article class="card product-card" data-id="' + esc(p.id) + '"><h2 style="margin-block-end:12px">' + esc(t('market.editProduct')) + '</h2>' +
      '<form data-form="product-edit" data-id="' + esc(p.id) + '" novalidate>' + productFormFields(p) +
      '<div class="btn-row" style="margin-block-start:14px"><button type="submit" class="btn btn-primary">' + esc(t('common.save')) + '</button>' +
      '<button type="button" class="btn btn-ghost" data-action="product-cancel-edit">' + esc(t('common.cancel')) + '</button></div></form></article>';
  }
  async function loadMarket(opts) {
    opts = opts || {};
    const el = body('market');
    if (!el) return;
    if (!opts.silent) el.innerHTML = skeletonGrid();
    const m = state.market;
    const offset = m.page * m.limit;
    const q = m.q ? '&q=' + encodeURIComponent(m.q) : '';
    const res = await api('/products?limit=' + m.limit + '&offset=' + offset + q, { silent: !!opts.silent });
    if (state.route !== 'market') return;
    $('#btn-new-product').hidden = !state.key;
    if (!res.ok) {
      el.innerHTML = res.error === 'unauthorized'
        ? lockedPanel()
        : (res.error === 'network' || res.error === 'internal') && !m.q ? errorState() : emptyState('🔍', 'market.noResults');
      return;
    }
    const d = res.data || {};
    const items = d.items || [];
    m.total = Number(d.total) || items.length;
    let html = '';
    if (state.key && m.formOpen) html += productNewCard() + '<div style="height:14px"></div>';
    if (!items.length) {
      html += emptyState(m.q ? '🔍' : '🛍️', m.q ? 'market.noResults' : 'market.empty');
    } else {
      html += '<div class="product-grid">' + items.map((p) => productCard(p, m.editing === p.id)).join('') + '</div>';
      html += '<div class="card table-card" style="margin-block-start:14px">' + pager('market', offset, m.limit, m.total) + '</div>';
    }
    el.innerHTML = html;
  }

  /* ═══════════════════════════ ORDERS ═══════════════════════════ */
  function ordersFilterRow() {
    const box = $('#orders-filters');
    if (!box) return;
    const statuses = ['all', 'paid', 'pending', 'delivered', 'refunded', 'cancelled'];
    box.innerHTML = statuses.map((s) =>
      '<button type="button" class="chip-btn" data-action="orders-filter" data-status="' + s + '" aria-pressed="' + (state.orders.status === s) + '">' +
      esc(s === 'all' ? t('orders.all') : t('status.' + s)) + '</button>'
    ).join('');
  }
  function orderActions(o) {
    if (!state.key) return '';
    const acts = [];
    if (o.status === 'pending') acts.push(['deliver', 'btn-green-ghost', 'orders.deliver']);
    if (o.status === 'pending') acts.push(['cancel', 'btn-warn', 'orders.cancel']);
    if (o.status === 'paid') acts.push(['deliver', 'btn-violet-ghost', 'orders.deliver']);
    if (o.status === 'paid' || o.status === 'delivered') acts.push(['refund', 'btn-danger', 'orders.refund']);
    if (!acts.length) return '';
    return '<div class="tbl-actions">' + acts.map((a) =>
      '<button type="button" class="btn btn-sm ' + a[1] + '" data-action="order-act" data-id="' + esc(o.id) + '" data-act="' + a[0] + '">' +
      esc(t(a[2])) + '</button>').join('') + '</div>';
  }
  async function loadOrders(opts) {
    opts = opts || {};
    const el = body('orders');
    if (!el) return;
    ordersFilterRow();
    if (!opts.silent) el.innerHTML = skeletonLines();
    const s = state.orders;
    const st = s.status !== 'all' ? '&status=' + encodeURIComponent(s.status) : '';
    const res = await api('/orders?limit=' + s.limit + '&offset=' + s.offset + st, { silent: !!opts.silent });
    if (state.route !== 'orders') return;
    if (!res.ok) {
      el.innerHTML = res.error === 'unauthorized' ? lockedPanel() : errorState();
      return;
    }
    const d = res.data || {};
    const items = d.items || [];
    s.total = Number(d.total) || items.length;
    if (!items.length) { el.innerHTML = '<div class="card">' + emptyState('🧾', 'orders.empty') + '</div>'; return; }
    el.innerHTML = '<div class="card table-card"><div class="table-scroll"><table class="tbl">' +
      '<thead><tr><th>#</th><th>' + esc(t('orders.product')) + '</th><th>' + esc(t('orders.buyer')) + '</th>' +
      '<th class="num">' + esc(t('orders.total')) + '</th><th>' + esc(t('orders.status')) + '</th>' +
      '<th>' + esc(t('orders.date')) + '</th>' + (state.key ? '<th>' + esc(t('orders.actions')) + '</th>' : '') + '</tr></thead><tbody>' +
      items.map((o) => {
        const prod = personName(o.product);
        return '<tr><td class="mono">' + esc(shortId(o.id)) + '</td>' +
          '<td><div class="cell-main" title="' + esc(prod) + '">' + esc(prod) + '</div></td>' +
          '<td>' + esc(personName(o.buyer)) + '</td>' +
          '<td class="num">' + esc(fmtTotal(o.totalStars, o.totalCredits)) + '</td>' +
          '<td>' + statusChip(o.status) + '</td>' +
          '<td class="cell-sub">' + esc(fmtDateTime(o.createdAt)) + '</td>' +
          (state.key ? '<td>' + orderActions(o) + '</td>' : '') + '</tr>';
      }).join('') +
      '</tbody></table></div>' + pager('orders', s.offset, s.limit, s.total) + '</div>';
  }

  /* ═══════════════════════════ WALLETS + USERS ═══════════════════════════ */
  function walletsSubtabs() {
    const box = $('#wallets-subtabs');
    if (!box) return;
    box.innerHTML = ['wallets', 'users'].map((k) =>
      '<button type="button" class="chip-btn" data-action="wallets-tab" data-tab="' + k + '" aria-pressed="' + (state.walletsTab === k) + '">' +
      esc(t('wallets.' + k)) + '</button>'
    ).join('');
  }
  async function loadWallets(opts) {
    opts = opts || {};
    const el = body('wallets');
    if (!el) return;
    walletsSubtabs();
    if (!opts.silent) el.innerHTML = skeletonLines();
    if (state.walletsTab === 'users') {
      const res = await api('/users?limit=100', { silent: !!opts.silent });
      if (state.route !== 'wallets') return;
      if (!res.ok) { el.innerHTML = res.error === 'unauthorized' ? lockedPanel() : errorState(); return; }
      const items = (res.data && res.data.items) || [];
      if (!items.length) { el.innerHTML = '<div class="card">' + emptyState('👥', 'wallets.empty') + '</div>'; return; }
      el.innerHTML = '<div class="card table-card"><div class="table-scroll"><table class="tbl">' +
        '<thead><tr><th>' + esc(t('wallets.user')) + '</th><th>' + esc(t('wallets.role')) + '</th>' +
        '<th>' + esc(t('wallets.language')) + '</th><th>' + esc(t('wallets.joined')) + '</th></tr></thead><tbody>' +
        items.map((u) =>
          '<tr><td>' + userCell(u.name, u.username) + '</td><td>' + roleBadge(u.role) + '</td>' +
          '<td class="mono">' + esc(u.language || '—') + '</td>' +
          '<td class="cell-sub">' + esc(fmtDate(u.createdAt)) + '</td></tr>'
        ).join('') + '</tbody></table></div></div>';
      return;
    }
    const res = await api('/wallets?limit=100', { silent: !!opts.silent });
    if (state.route !== 'wallets') return;
    if (!res.ok) { el.innerHTML = res.error === 'unauthorized' ? lockedPanel() : errorState(); return; }
    const items = (res.data && res.data.items) || [];
    if (!items.length) { el.innerHTML = '<div class="card">' + emptyState('👛', 'wallets.empty') + '</div>'; return; }
    el.innerHTML = '<div class="card table-card"><div class="table-scroll"><table class="tbl">' +
      '<thead><tr><th>' + esc(t('wallets.user')) + '</th><th>' + esc(t('wallets.role')) + '</th>' +
      '<th class="num">' + esc(t('wallets.balance')) + '</th><th class="num">' + esc(t('wallets.locked')) + '</th>' +
      '<th class="num">' + esc(t('wallets.credits')) + '</th></tr></thead><tbody>' +
      items.map((w) =>
        '<tr><td>' + userCell(w.name, w.username) + '</td><td>' + roleBadge(w.role) + '</td>' +
        '<td class="num">' + fmtInt(w.balance) + '</td><td class="num">' + fmtInt(w.locked) + '</td>' +
        '<td class="num">' + fmtInt(w.credits) + '</td></tr>'
      ).join('') + '</tbody></table></div></div>';
  }

  /* ═══════════════════════════ QUESTS ═══════════════════════════ */
  async function loadQuests(opts) {
    opts = opts || {};
    const el = body('quests');
    if (!el) return;
    if (!opts.silent) el.innerHTML = skeletonGrid();
    const res = await api('/quests', { silent: !!opts.silent });
    if (state.route !== 'quests') return;
    if (!res.ok) { el.innerHTML = res.error === 'unauthorized' ? lockedPanel() : errorState(); return; }
    const items = (res.data && res.data.items) || [];
    if (!items.length) { el.innerHTML = '<div class="card">' + emptyState('🎯', 'quests.empty') + '</div>'; return; }
    el.innerHTML = '<div class="quest-grid">' + items.map((qv) => {
      const q = qv.quest || qv || {};
      const credit = q.creditReward != null ? Number(q.creditReward) : (Number(q.reward) || 0);
      const target = Math.max(1, Number(q.target) || 1);
      const prog = Math.min(Number(qv.progress) || 0, target);
      const pct = Math.round((prog / target) * 100);
      const typeKey = { daily: 'quests.daily', weekly: 'quests.weekly', onetime: 'quests.onetime' }[q.type] || 'quests.onetime';
      const rewards =
        (credit > 0 ? '<span class="price credits">💎 ' + fmtInt(credit) + '</span>' : '') +
        '<span class="price stars">⚡ ' + fmtInt(q.xpReward) + ' ' + esc(t('quests.xp')) + '</span>';
      const completed = qv.completed === true || qv.completedAt != null;
      return '<article class="card quest-card hoverable">' +
        '<div class="quest-head"><div><div class="quest-title">' + esc(q.title || '—') + '</div></div>' +
        '<div class="chip-row">' + (completed ? '<span class="chip c-paid">✓ ' + esc(t('quests.completed')) + '</span>' : '') +
        '<span class="chip c-delivered">' + esc(t(typeKey)) + '</span></div></div>' +
        (q.description ? '<div class="quest-desc">' + esc(q.description) + '</div>' : '') +
        '<div class="quest-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
        '<div class="quest-meta"><span>' + fmtInt(prog) + ' / ' + fmtInt(target) + '</span>' +
        '<span>' + esc(t('quests.reward')) + ': ' + rewards + '</span></div>' +
        '<div class="quest-rewards">' + rewards + '</div>' +
        '</article>';
    }).join('') + '</div>';
  }

  /* ═══════════════════════════ LEADERBOARD ═══════════════════════════ */
  function lbTabs() {
    const box = $('#lb-tabs');
    if (!box) return;
    box.innerHTML = ['xp', 'sales', 'ref'].map((k) =>
      '<button type="button" class="chip-btn" data-action="lb-tab" data-type="' + k + '" aria-pressed="' + (state.lbType === k) + '">' +
      esc(t('lb.' + k)) + '</button>'
    ).join('');
  }
  async function loadLeaderboard(opts) {
    opts = opts || {};
    const el = body('leaderboard');
    if (!el) return;
    lbTabs();
    if (!opts.silent) el.innerHTML = skeletonLines();
    const res = await api('/leaderboard?type=' + encodeURIComponent(state.lbType) + '&limit=25', { silent: !!opts.silent });
    if (state.route !== 'leaderboard') return;
    if (!res.ok) { el.innerHTML = res.error === 'unauthorized' ? lockedPanel() : errorState(); return; }
    const items = (res.data && res.data.items) || [];
    if (!items.length) { el.innerHTML = '<div class="card">' + emptyState('🏆', 'lb.empty') + '</div>'; return; }
    const medals = ['🥇', '🥈', '🥉'];
    const unitKey = 'lb.unit.' + state.lbType;
    el.innerHTML = '<div class="lb-list">' + items.map((r) => {
      const rank = Number(r.rank) || 0;
      const medal = rank >= 1 && rank <= 3 ? '<span class="lb-medal">' + medals[rank - 1] + '</span>' : '<span class="lb-ranknum">#' + rank + '</span>';
      const val = r[state.lbType === 'ref' ? 'refs' : state.lbType];
      return '<div class="lb-row' + (rank <= 3 ? ' top' + rank : '') + '">' + medal +
        '<span class="lb-name">' + esc(personName(r)) + '</span>' +
        '<span class="lb-val">' + fmtInt(val) + ' <small style="font-weight:600;color:var(--faint)">' + esc(t(unitKey)) + '</small></span></div>';
    }).join('') + '</div>';
  }

  /* ═══════════════════════════ BOOKINGS ═══════════════════════════ */
  async function loadBookings(opts) {
    opts = opts || {};
    const el = body('bookings');
    if (!el) return;
    if (!opts.silent) el.innerHTML = skeletonLines();
    const res = await api('/bookings?limit=50', { silent: !!opts.silent });
    if (state.route !== 'bookings') return;
    if (!res.ok) { el.innerHTML = res.error === 'unauthorized' ? lockedPanel() : errorState(); return; }
    const items = (res.data && res.data.items) || [];
    if (!items.length) { el.innerHTML = '<div class="card">' + emptyState('📅', 'bookings.empty') + '</div>'; return; }
    el.innerHTML = '<div class="booking-list">' + items.map((b) => {
      const d = new Date(b.slotAt);
      const day = isNaN(d.getTime()) ? '—' : String(d.getDate()).padStart(2, '0');
      const mon = isNaN(d.getTime()) ? '' : d.toLocaleString('en', { month: 'short' });
      return '<div class="card booking-row hoverable">' +
        '<div class="booking-date" aria-hidden="true"><b>' + esc(day) + '</b><span>' + esc(mon) + '</span></div>' +
        '<div><div class="booking-title">' + esc(b.service || '—') + '</div>' +
        '<div class="booking-meta">' + esc(t('bookings.slot')) + ': ' + esc(fmtDateTime(b.slotAt)) + ' · ' +
        esc(t('bookings.user')) + ': ' + esc(personName(b.user || b.userName)) + '</div></div>' +
        '<div>' + statusChip(b.status || 'confirmed') + '</div></div>';
    }).join('') + '</div>';
  }

  /* ═══════════════════════════ OWNER ═══════════════════════════ */
  let ownerEditSetting = null;
  function sectionTitle(icon, key, countHtml) {
    return '<h2 class="section-title"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + icon + '</svg>' +
      esc(t(key)) + (countHtml || '') + '</h2>';
  }
  async function loadOwner(opts) {
    opts = opts || {};
    const el = body('owner');
    if (!el) return;
    if (!state.key) { el.innerHTML = lockedPanel(); return; }
    if (!opts.silent) el.innerHTML = '<div class="owner-sections">' +
      '<div>' + skeletonLines() + '</div><div>' + skeletonLines() + '</div></div>';
    const sections = [];
    const [ap, st, sec] = await Promise.all([
      api('/approvals?status=pending', { silent: true }),
      api('/settings', { silent: true }),
      api('/security', { silent: true })
    ]);
    if (state.route !== 'owner') return;
    if (ap.error === 'unauthorized' || st.error === 'unauthorized' || sec.error === 'unauthorized') {
      el.innerHTML = lockedPanel();
      return;
    }

    /* — Approvals — */
    const items = (ap.ok && ap.data && ap.data.items) || [];
    sections.push('<section>' + sectionTitle('<path d="M12 2.8 4.4 5.8v5.4c0 4.6 3.2 8.2 7.6 9.9 4.4-1.7 7.6-5.3 7.6-9.9V5.8L12 2.8Z"/><path d="M9.2 11.8h5.6M12 11.8v4"/>', 'owner.approvals',
      items.length ? '<span class="count-pill">' + fmtInt(items.length) + '</span>' : '') +
      (items.length
        ? '<div class="approval-list">' + items.map((a) => {
          const mins = a.expiresAt ? Math.round((new Date(a.expiresAt).getTime() - Date.now()) / 60000) : null;
          const risk = String(a.riskLevel || 'low').toLowerCase();
          return '<div class="card approval-card"><div class="approval-head">' +
            '<span class="chip c-delivered">' + esc(a.type || 'action') + '</span>' +
            '<span class="chip risk-' + esc(['high', 'medium', 'low'].indexOf(risk) >= 0 ? risk : 'low') + '">' + esc(risk) + '</span>' +
            (mins != null ? '<span class="approval-exp">⏳ ' + esc(t('owner.expires')) + ' ~' + fmtInt(Math.max(0, mins)) + 'm</span>' : '') +
            '</div><div class="approval-summary">' + esc(a.summary || '—') + '</div>' +
            '<div class="btn-row"><button type="button" class="btn btn-sm btn-green" data-action="approval-decide" data-id="' + esc(a.id) + '" data-approve="1">✅ ' + esc(t('owner.approve')) + '</button>' +
            '<button type="button" class="btn btn-sm btn-danger" data-action="approval-decide" data-id="' + esc(a.id) + '" data-approve="0">❌ ' + esc(t('owner.reject')) + '</button></div></div>';
        }).join('') + '</div>'
        : '<div class="card">' + emptyState('✨', 'owner.noApprovals') + '</div>') +
      '</section>');

    /* — Broadcast — */
    sections.push('<section>' + sectionTitle('<path d="M3.4 10.4v3.2a1 1 0 0 0 1 1h2l4.6 4a0.8 0.8 0 0 0 1.3-.6V6a0.8 0.8 0 0 0-1.3-.6l-4.6 4h-2a1 1 0 0 0-1 1Z"/><path d="M16.2 8.6a5 5 0 0 1 0 6.8M18.8 6a9 9 0 0 1 0 12"/>', 'owner.broadcast') +
      '<div class="card"><form data-form="broadcast" novalidate>' +
      '<textarea class="input" name="text" rows="3" maxlength="3500" required placeholder="' + esc(t('owner.broadcastPh')) + '" aria-label="' + esc(t('owner.broadcast')) + '"></textarea>' +
      '<div class="btn-row" style="margin-block-start:12px;align-items:center"><button type="submit" class="btn btn-primary">' + esc(t('owner.send')) + '</button>' +
      '<span class="cell-sub">' + esc(t('owner.broadcastHint')) + '</span></div></form></div></section>');

    /* — Settings table — */
    const stItems = (st.ok && st.data && st.data.items) || [];
    sections.push('<section>' + sectionTitle('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83"/>', 'owner.settingsTitle') +
      (stItems.length
        ? '<div class="card table-card"><div class="table-scroll"><table class="tbl">' +
          '<thead><tr><th>Key</th><th>' + esc(t('owner.value')) + '</th><th></th></tr></thead><tbody>' +
          stItems.map((s) => {
            if (ownerEditSetting === s.key) {
              return '<tr><td class="mono">' + esc(s.key) + '</td>' +
                '<td><form data-form="setting-edit" data-key="' + esc(s.key) + '" class="key-row">' +
                '<input class="input" name="value" value="' + esc(s.value) + '" aria-label="' + esc(s.key) + '"></form></td>' +
                '<td><div class="tbl-actions"><button type="button" class="btn btn-sm btn-green" data-action="setting-save" data-key="' + esc(s.key) + '">' + esc(t('common.save')) + '</button>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-action="setting-cancel">' + esc(t('common.cancel')) + '</button></div></td></tr>';
            }
            return '<tr><td class="mono">' + esc(s.key) + '</td><td style="max-width:320px;overflow-wrap:anywhere">' + esc(s.value) + '</td>' +
              '<td><div class="tbl-actions"><button type="button" class="btn btn-sm btn-violet-ghost" data-action="setting-edit" data-key="' + esc(s.key) + '">' + esc(t('market.edit')) + '</button></div></td></tr>';
          }).join('') + '</tbody></table></div></div>'
        : '<div class="card">' + emptyState('⚙️', 'common.empty') + '</div>') +
      '</section>');

    /* — Security: 15 layers + audit tail — */
    let layersHtml = '';
    if (sec.ok && sec.data) {
      const rawLayers = sec.data.layers;
      const layers = Array.isArray(rawLayers)
        ? rawLayers
        : (rawLayers && typeof rawLayers === 'object')
          ? Object.keys(rawLayers).map((k) => {
            const v = rawLayers[k];
            if (typeof v === 'string') return { id: k, name: k + ' ' + v };
            return Object.assign({ id: k }, v);
          })
          : [];
      layersHtml = layers.length
        ? '<div class="layers-list">' + layers.map((L) => {
          const inactive = L.active === false || L.enabled === false || L.off === true;
          const name = L.name || L.title || ('L' + L.id);
          return '<div class="layer-row"><span class="layer-id">' + esc(typeof L.id === 'number' ? 'L' + String(L.id).padStart(2, '0') : String(L.id || '')) + '</span>' +
            '<div><div class="layer-name">' + esc(name) + '</div>' +
            (L.description ? '<div class="layer-desc">' + esc(L.description) + '</div>' : '') + '</div>' +
            '<span class="layer-state ' + (inactive ? 'off' : 'on') + '"><i aria-hidden="true"></i>' + esc(t(inactive ? 'owner.inactiveState' : 'owner.activeState')) + '</span></div>';
        }).join('') + '</div>'
        : '<div class="card">' + emptyState('🛡️', 'common.empty') + '</div>';

      const audit = (Array.isArray(sec.data.audit) ? sec.data.audit : []).slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 15);
      const auditHtml = audit.length
        ? '<h3 style="margin:16px 0 10px">' + esc(t('owner.audit')) + '</h3>' +
          '<div class="card table-card"><div class="table-scroll"><table class="tbl">' +
          '<thead><tr><th>' + esc(t('owner.time')) + '</th><th>' + esc(t('owner.actor')) + '</th><th>' + esc(t('owner.action')) + '</th><th>' + esc(t('owner.target')) + '</th><th>' + esc(t('owner.statusCol')) + '</th></tr></thead><tbody>' +
          audit.map((a) =>
            '<tr><td class="cell-sub mono">' + esc(fmtDateTime(a.createdAt)) + '</td>' +
            '<td class="mono">' + esc(a.actor || '—') + '</td>' +
            '<td class="mono">' + esc(a.action || '—') + '</td>' +
            '<td class="cell-sub" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.target || '—') + '</td>' +
            '<td>' + statusChip(a.status || 'ok') + '</td></tr>'
          ).join('') + '</tbody></table></div></div>'
        : '';
      sections.push('<section>' + sectionTitle('<path d="M12 2.8 4.4 5.8v5.4c0 4.6 3.2 8.2 7.6 9.9 4.4-1.7 7.6-5.3 7.6-9.9V5.8L12 2.8Z"/>', 'owner.security') +
        layersHtml + auditHtml + '</section>');
    }

    el.innerHTML = '<div class="owner-sections">' + sections.join('') + '</div>';
  }

  /* ═══════════════════════════ SETTINGS ═══════════════════════════ */
  const LANGS = [['en', 'English', 'English'], ['fa', 'فارسی', 'Persian'], ['ru', 'Русский', 'Russian'], ['ar', 'العربية', 'Arabic']];
  function renderSettings() {
    const el = body('settings');
    if (!el) return;
    const h = state.health || {};
    const sys = [['db', h.db], ['bot', h.bot], ['ai', h.ai]].map((p) => {
      const val = p[1];
      const ok = val === true || val === 'ok' || val === 'up' || val === 'connected';
      const unknown = val == null || val === '' || val === 'unknown';
      return '<span class="chip ' + (unknown ? '' : ok ? 'c-paid' : 'c-refunded') + '">' + esc(p[0]) + ': ' +
        esc(unknown ? '?' : ok ? '✓' : '✗') + '</span>';
    }).join('');
    el.innerHTML =
      '<div class="settings-grid">' +
      /* language */
      '<div class="card settings-card"><h2>' + esc(t('settings.language')) + '</h2>' +
      '<p class="hint">' + esc(t('settings.langHint')) + '</p>' +
      '<div class="lang-grid">' + LANGS.map((L) =>
        '<button type="button" class="lang-btn" data-action="set-lang" data-lang="' + L[0] + '" aria-pressed="' + (state.lang === L[0]) + '">' +
        '<b>' + esc(L[1]) + '</b><span>' + esc(L[2]) + ' · ' + L[0].toUpperCase() + '</span></button>').join('') +
      '</div></div>' +
      /* theme */
      '<div class="card settings-card"><h2>' + esc(t('settings.theme')) + '</h2><p class="hint">' + esc(t('settings.themeHint')) + '</p>' +
      '<div class="theme-row"><div class="label"><b>' + esc(t('settings.dark')) + '</b><span>' + esc(t('settings.light')) + ' ↔ ' + esc(t('settings.dark')) + '</span></div>' +
      '<span class="switch"><input type="checkbox" id="theme-switch" role="switch" aria-label="' + esc(t('settings.theme')) + '"' + (state.theme !== 'light' ? ' checked' : '') + '><i aria-hidden="true"></i></span>' +
      '</div></div>' +
      /* owner key */
      '<div class="card settings-card"><h2>' + esc(t('settings.ownerKey')) + '</h2><p class="hint">' + esc(t('settings.ownerKeyHint')) + '</p>' +
      '<div class="key-row"><input class="input" type="password" id="settings-key" placeholder="' + esc(t('owner.keyPh')) + '" autocomplete="off" spellcheck="false" aria-label="' + esc(t('settings.ownerKey')) + '">' +
      '<button type="button" class="btn btn-primary" data-action="save-key">' + esc(t('owner.saveKey')) + '</button>' +
      '<button type="button" class="btn btn-danger" data-action="clear-key">' + esc(t('owner.clearKey')) + '</button></div>' +
      (state.key ? '<p class="hint" style="margin-block:10px 0">🔓 ' + esc(t('toast.unlocked')) + '</p>' : '') +
      '</div>' +
      /* about */
      '<div class="card settings-card"><h2>' + esc(t('settings.about')) + '</h2>' +
      '<div class="about-list" style="margin-block-start:12px">' +
      '<div class="about-row"><span class="k">' + esc(t('settings.version')) + '</span><span class="v mono">' + esc((h && h.version) || '—') + '</span></div>' +
      '<div class="about-row"><span class="k">' + esc(t('settings.uptime')) + '</span><span class="v mono">' + esc(h && h.uptime != null ? fmtUptime(h.uptime) : '—') + '</span></div>' +
      '<div class="about-row"><span class="k">' + esc(t('settings.system')) + '</span><span class="v"><span class="sys-dots">' + sys + '</span></span></div>' +
      '<div class="about-row"><span class="k">' + esc(t('settings.license')) + '</span><span class="v">MIT</span></div>' +
      '<div class="about-row"><span class="k">API</span><span class="v mono">/api/v1 · docs/API.md</span></div>' +
      '</div><p class="hint" style="margin:12px 0 0">' + esc(t('settings.made')) + '</p></div>' +
      '</div>';
  }

  /* ─────────────────────────── Lead CRM ═══════════════════════════ */
  const CRM_STAGES = ['new', 'warm', 'won', 'lost'];
  function stageButtons(current) {
    const all = [{ k: 'all', label: t('crm.stageAll') }].concat(CRM_STAGES.map((s) => ({ k: s, label: t('status.' + s) === 'status.' + s ? s : t('status.' + s) })));
    return '<div class="btn-row" role="tablist" aria-label="CRM stages">' + all.map((s) =>
      '<button type="button" class="btn btn-sm ' + (current === s.k ? 'btn-primary' : 'btn-ghost') + '" data-action="crm-tab" data-stage="' + s.k + '" aria-pressed="' + (current === s.k) + '">' + esc(s.label) + '</button>'
    ).join('') + '</div>';
  }
  function leadRow(l) {
    const next = { new: ['warm', 'won', 'lost'], warm: ['won', 'lost'], lost: ['warm'], won: [] }[l.stage] || [];
    const stageBtns = next.map((s) =>
      '<button type="button" class="btn btn-sm btn-ghost" data-action="lead-stage" data-id="' + esc(l.id) + '" data-stage="' + s + '">' + esc(t('status.' + s) === 'status.' + s ? s : t('status.' + s)) + '</button>'
    ).join(' ');
    return '<tr>' +
      '<td><div class="cell-main">' + esc(l.contact) + '</div>' + (l.name ? '<div class="cell-sub">' + esc(l.name) + (l.company ? ' · ' + esc(l.company) : '') + '</div>' : '') + '</td>' +
      '<td>' + statusChip(l.stage) + '</td>' +
      '<td class="mono">' + (l.score ? fmtInt(l.score) : '—') + '</td>' +
      '<td>' + esc(l.source || '—') + '</td>' +
      '<td class="mono">' + fmtDate(l.lastTouchedAt) + '</td>' +
      '<td><div class="btn-row">' + (stageBtns || '<span class="chip c-paid">✓</span>') + '</div></td>' +
      '</tr>';
  }
  async function loadCrm(opts) {
    opts = opts || {};
    const el = body('crm');
    if (!el) return;
    if (!opts.silent) el.innerHTML = skeletonGrid() + '<div style="height:14px"></div>' + skeletonLines();
    if (!state.key) { el.innerHTML = lockedPanel(); return; }
    const q = [ 'limit=' + state.crm.limit, 'offset=' + state.crm.offset ];
    if (state.crm.stage !== 'all') q.push('stage=' + encodeURIComponent(state.crm.stage));
    const [leadsRes, statsRes] = await Promise.all([
      api('/leads?' + q.join('&'), { silent: !!opts.silent }),
      api('/leads/stats', { silent: true })
    ]);
    if (state.route !== 'crm') return;
    if (!leadsRes.ok) { el.innerHTML = leadsRes.error === 'unauthorized' ? lockedPanel() : errorState(); return; }
    const d = leadsRes.data || {};
    state.crm.total = d.total || 0;
    const s = statsRes.ok ? statsRes.data : null;
    const kpis = s ?
      kpiCard('crm.stats.total', fmtInt(s.total), { icon: '<path d="M16 21v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 19.4V21"/><circle cx="9.5" cy="8.5" r="3.6"/>' }) +
      kpiCard('crm.stats.wonRate', fmtInt(s.wonRate) + '%', { mod: 'kpi-green', hint: t('crm.funnelHint') }) +
      kpiCard('crm.stats.fresh', fmtInt(s.fresh24h), { mod: 'kpi-amber' }) :
      '';
    const stage = state.crm.stage;
    const stageLabel = stage === 'all' ? t('crm.stageAll') : (t('status.' + stage) === 'status.' + stage ? stage : t('status.' + stage));
    const table = d.items && d.items.length ?
      '<div class="table-wrap"><table><thead><tr>' +
      '<th>' + esc(t('crm.contact')) + '</th><th>' + esc(t('crm.stage')) + '</th><th>' + esc(t('crm.score')) + '</th><th>' + esc(t('crm.source')) + '</th><th>' + esc(t('crm.lastTouch')) + '</th><th></th>' +
      '</tr></thead><tbody>' + d.items.map(leadRow).join('') + '</tbody></table></div>' +
      pager('crm', state.crm.offset, state.crm.limit, state.crm.total) :
      emptyState('🎯', 'crm.empty');
    el.innerHTML =
      '<div class="kpi-grid">' + kpis + '</div>' +
      '<div class="card" style="margin-top:14px"><h2>' + esc(t('crm.addTitle')) + '</h2>' +
      '<form data-form="lead-add" class="key-row" style="margin-top:10px">' +
      '<input class="input" name="contact" placeholder="email · +phone · @user" required aria-label="' + esc(t('crm.contact')) + '">' +
      '<input class="input" name="name" placeholder="' + esc(t('crm.name')) + '" aria-label="' + esc(t('crm.name')) + '">' +
      '<button type="submit" class="btn btn-primary">' + esc(t('crm.addBtn')) + '</button></form></div>' +
      '<div class="card" style="margin-top:14px"><h2>' + esc(t('crm.importTitle')) + '</h2>' +
      '<p class="hint">' + esc(t('crm.importHint')) + '</p>' +
      '<form data-form="lead-import"><textarea class="input" name="rows" rows="4" style="width:100%;font-family:var(--mono),monospace" spellcheck="false" placeholder="[{&quot;contact&quot;:&quot;+447700900123&quot;,&quot;name&quot;:&quot;Alice&quot;,&quot;tags&quot;:[&quot;gym&quot;]}]"></textarea>' +
      '<div class="btn-row" style="margin-top:10px"><button type="submit" class="btn btn-primary">' + esc(t('crm.importBtn')) + '</button></div></form></div>' +
      '<div class="card" style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
      '<h2 style="margin:0">' + esc(stageLabel) + ' · ' + fmtInt(state.crm.total) + '</h2>' + stageButtons(stage) + '</div>' + table + '</div>';
  }

  /* ─────────────────────────── loaders map ─────────────────────────── */
  const LOADERS = {
    overview: loadOverview,
    market: loadMarket,
    orders: loadOrders,
    wallets: loadWallets,
    quests: loadQuests,
    leaderboard: loadLeaderboard,
    bookings: loadBookings,
    crm: loadCrm,
    owner: loadOwner,
    settings: () => renderSettings()
  };
  const debouncedRefresh = debounce(() => {
    const l = LOADERS[state.route];
    if (l) l({ silent: true });
  }, 2000);
  function refreshCurrent(silent) {
    const l = LOADERS[state.route];
    if (l) l({ silent: !!silent });
  }

  /* ─────────────────────────── owner mode / key modal ─────────────────────────── */
  function applyOwnerMode(on) {
    $$('.nav-owner').forEach((n) => { n.hidden = !on; });
    const btn = $('#btn-unlock');
    const label = $('#btn-unlock-label');
    if (btn) btn.classList.toggle('is-unlocked', on);
    if (label) label.textContent = t(on ? 'topbar.owner' : 'topbar.unlock');
  }
  function openKeyModal() {
    const d = $('#key-modal');
    if (!d) return;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
    else d.setAttribute('open', '');
    const input = $('#key-input');
    if (input) setTimeout(() => input.focus(), 30);
  }
  function closeKeyModal() {
    const d = $('#key-modal');
    if (!d) return;
    if (typeof d.close === 'function') { if (d.open) d.close(); }
    else d.removeAttribute('open');
  }
  async function tryUnlock(key) {
    const k = String(key || '').trim();
    if (!k) { toast(t('toast.ownerRequired'), 'warn'); return false; }
    const prev = state.key;
    state.key = k;
    const probe = await api('/wallets?limit=1', { silent: true });
    if (probe.ok) {
      localStorage.setItem('kia_key', k);
      applyOwnerMode(true);
      toast(t('toast.unlocked'), 'success');
      if (state.route === 'owner' || state.route === 'orders' || state.route === 'wallets' || state.route === 'bookings' || state.route === 'crm') refreshCurrent(true);
      return true;
    }
    state.key = prev;
    toast(t('toast.keyInvalid'), 'error');
    return false;
  }
  function clearOwnerKey() {
    state.key = '';
    localStorage.removeItem('kia_key');
    applyOwnerMode(false);
    closeKeyModal();
    toast(t('toast.keyCleared'), 'info');
    if (state.route === 'owner') { location.hash = '#/overview'; }
    else refreshCurrent(true);
  }

  /* ─────────────────────────── SSE live updates ─────────────────────────── */
  let es = null, esFails = 0, pollTimer = null, liveMode = 'off';
  function setLive(mode) {
    liveMode = mode;
    const dot = $('#live-dot'), label = $('#live-label');
    if (dot) {
      dot.classList.remove('is-live', 'is-poll');
      if (mode === 'live') dot.classList.add('is-live');
      if (mode === 'poll') dot.classList.add('is-poll');
    }
    if (label) label.textContent = t(mode === 'live' ? 'topbar.live' : mode === 'poll' ? 'topbar.polling' : 'topbar.offline');
  }
  function handleBusEvent(type, payload) {
    const p = payload || {};
    if (type === 'order_paid') toast(t('toast.paid') + (p.buyer ? ' — ' + p.buyer : ''), 'success');
    else if (type === 'order_delivered') toast(t('toast.delivered') + (p.buyer ? ' — ' + p.buyer : ''), 'success');
    else if (type === 'approval_created' && state.key) toast(t('toast.newApproval'), 'info');
    else if (type === 'notify_owner' && state.key) {
      const msg = typeof p === 'string' ? p : (p.text || p.message || '');
      if (msg) toast(String(msg), 'info');
    }
    if (state.route === 'owner' && (type === 'approval_created' || type === 'approval_resolved')) {
      loadOwner({ silent: true });
    } else {
      debouncedRefresh();
    }
  }
  async function connectSSE() {
    if (!('EventSource' in window)) { startPolling(); return; }
    // The stream is key-gated: exchange the dashboard key for a short-lived
    // token first (EventSource cannot send headers). Guest mode → polling.
    if (!state.key) { startPolling(); return; }
    let token = null;
    try {
      const tok = await api('/stream-token', { method: 'POST', silent: true });
      token = tok && tok.token ? encodeURIComponent(tok.token) : null;
    } catch (e) { token = null; }
    if (!token) { startPolling(); return; }
    try { es = new EventSource('/api/v1/stream?token=' + token); }
    catch (e) { startPolling(); return; }
    es.onopen = () => { esFails = 0; setLive('live'); };
    es.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { msg = null; }
      if (msg && msg.type) handleBusEvent(String(msg.type), msg.payload);
    };
    es.onerror = () => {
      setLive('off');
      esFails += 1;
      if (esFails >= 3 && es) {
        try { es.close(); } catch (e) { /* noop */ }
        es = null;
        startPolling();
      }
    };
  }
  function startPolling() {
    setLive('poll');
    if (pollTimer) return;
    pollTimer = setInterval(() => refreshCurrent(true), 30000);
  }

  /* ─────────────────────────── i18n application ─────────────────────────── */
  function applyI18n() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = RTL_LANGS.indexOf(state.lang) >= 0 ? 'rtl' : 'ltr';
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    const sel = $('#lang-select');
    if (sel) sel.value = state.lang;
    setLive(liveMode);
    applyOwnerMode(!!state.key);
  }
  function setLang(lang) {
    if (!I18N[lang]) return;
    state.lang = lang;
    localStorage.setItem('kia_lang', lang);
    applyI18n();
    onRoute();
  }
  function setTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    localStorage.setItem('kia_theme', state.theme);
    document.documentElement.dataset.theme = state.theme;
    const sw = $('#theme-switch');
    if (sw) sw.checked = state.theme !== 'light';
  }

  /* ─────────────────────────── global event delegation ─────────────────────────── */
  document.addEventListener('click', (e) => {
    const el = e.target.closest ? e.target.closest('[data-action], [data-close-modal]') : null;
    if (!el) return;

    if (el.hasAttribute('data-close-modal')) { closeKeyModal(); return; }

    const action = el.dataset.action;
    switch (action) {
      case 'open-unlock': openKeyModal(); break;
      case 'retry': refreshCurrent(false); break;
      case 'chart-metric':
        state.chartMetric = el.dataset.metric === 'orders' ? 'orders' : 'revenue';
        loadOverview({ silent: true });
        break;
      case 'orders-filter':
        state.orders.status = el.dataset.status || 'all';
        state.orders.offset = 0;
        loadOrders(false);
        break;
      case 'wallets-tab':
        state.walletsTab = el.dataset.tab === 'users' ? 'users' : 'wallets';
        loadWallets(false);
        break;
      case 'lb-tab':
        state.lbType = ['xp', 'sales', 'ref'].indexOf(el.dataset.type) >= 0 ? el.dataset.type : 'xp';
        loadLeaderboard(false);
        break;
      case 'page-prev':
      case 'page-next': {
        const scope = el.dataset.scope;
        const delta = action === 'page-prev' ? -1 : 1;
        if (scope === 'market') {
          state.market.page = Math.max(0, state.market.page + delta);
          state.market.editing = null;
          loadMarket(false);
        } else if (scope === 'orders') {
          state.orders.offset = Math.max(0, state.orders.offset + delta * state.orders.limit);
          loadOrders(false);
        } else if (scope === 'crm') {
          state.crm.offset = Math.max(0, state.crm.offset + delta * state.crm.limit);
          loadCrm(false);
        }
        break;
      }
      case 'crm-tab':
        state.crm.stage = CRM_STAGES.indexOf(el.dataset.stage) >= 0 ? el.dataset.stage : 'all';
        state.crm.offset = 0;
        loadCrm({ silent: true });
        break;
      case 'lead-stage': {
        const id = el.dataset.id;
        const stage = el.dataset.stage;
        if (id && stage) {
          api('/leads/' + encodeURIComponent(id) + '/stage', { method: 'POST', body: { stage: stage } })
            .then((r) => { if (r.ok) { toast(t('toast.saved'), 'success'); loadCrm({ silent: true }); } });
        }
        break;
      }
      case 'product-edit':
        state.market.editing = el.dataset.id;
        loadMarket({ silent: true });
        break;
      case 'product-cancel-edit':
        state.market.editing = null;
        loadMarket({ silent: true });
        break;
      case 'product-cancel-new':
        state.market.formOpen = false;
        loadMarket({ silent: true });
        break;
      case 'product-archive': {
        const id = el.dataset.id;
        if (id && window.confirm(t('market.confirmArchive'))) {
          api('/products/' + encodeURIComponent(id), { method: 'DELETE', silent: false })
            .then((r) => { if (r.ok) { toast(t('toast.done'), 'success'); loadMarket({ silent: true }); } });
        }
        break;
      }
      case 'order-act': {
        const id = el.dataset.id, act = el.dataset.act;
        const confirmKey = { deliver: 'orders.confirmDeliver', cancel: 'orders.confirmCancel', refund: 'orders.confirmRefund' }[act];
        if (!id || !confirmKey) break;
        if (window.confirm(t(confirmKey))) {
          api('/orders/' + encodeURIComponent(id) + '/status', { method: 'POST', body: { action: act } })
            .then((r) => { if (r.ok) { toast(t('toast.done'), 'success'); loadOrders({ silent: true }); } });
        }
        break;
      }
      case 'approval-decide': {
        const id = el.dataset.id;
        const approve = el.dataset.approve === '1';
        if (!id) break;
        let bodyReq = { approve: approve };
        if (!approve) {
          const note = window.prompt(t('owner.notePrompt'), '');
          if (note === null) break;
          if (note.trim()) bodyReq.note = note.trim();
        }
        api('/approvals/' + encodeURIComponent(id) + '/decide', { method: 'POST', body: bodyReq })
          .then((r) => { if (r.ok) { toast(approve ? t('toast.done') : t('toast.done'), 'success'); loadOwner({ silent: true }); } });
        break;
      }
      case 'setting-edit':
        ownerEditSetting = el.dataset.key;
        loadOwner({ silent: true });
        break;
      case 'setting-cancel':
        ownerEditSetting = null;
        loadOwner({ silent: true });
        break;
      case 'setting-save': {
        const key = el.dataset.key;
        const row = el.closest('tr');
        const input = row ? row.querySelector('input[name="value"]') : null;
        if (!key || !input) break;
        const value = input.value;
        api('/settings', { method: 'PUT', body: { key: key, value: value } })
          .then((r) => {
            if (r.ok) { ownerEditSetting = null; toast(t('toast.saved'), 'success'); loadOwner({ silent: true }); }
          });
        break;
      }
      case 'set-lang':
        setLang(el.dataset.lang);
        break;
      case 'save-key': {
        const inp = $('#settings-key');
        if (inp && inp.value.trim()) {
          tryUnlock(inp.value.trim()).then((ok) => { if (ok) { inp.value = ''; renderSettings(); } });
        } else toast(t('toast.ownerRequired'), 'warn');
        break;
      }
      case 'clear-key':
        clearOwnerKey();
        if (state.route === 'settings') renderSettings();
        break;
      default: break;
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const kind = form.getAttribute('data-form');

    if (kind === 'product-new' || kind === 'product-edit') {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        title: String(fd.get('title') || '').trim(),
        category: String(fd.get('category') || 'general').trim() || 'general',
        priceStars: Math.max(0, parseInt(fd.get('priceStars'), 10) || 0),
        priceCredits: Math.max(0, parseInt(fd.get('priceCredits'), 10) || 0),
        stock: fd.get('stock') === '' || fd.get('stock') == null ? -1 : (parseInt(fd.get('stock'), 10) || 0),
        featured: fd.get('featured') === 'on',
        description: String(fd.get('description') || '').trim()
      };
      if (!payload.title) { toast(t('market.title') + ' — required', 'warn'); return; }
      let req;
      if (kind === 'product-edit') {
        const id = form.getAttribute('data-id');
        payload.active = fd.get('active') === 'on';
        req = api('/products/' + encodeURIComponent(id), { method: 'PATCH', body: payload });
      } else {
        req = api('/products', { method: 'POST', body: payload });
      }
      req.then((r) => {
        if (r.ok) {
          state.market.editing = null;
          state.market.formOpen = false;
          toast(t(kind === 'product-edit' ? 'toast.saved' : 'market.created'), 'success');
          loadMarket({ silent: true });
        }
      });
      return;
    }

    if (kind === 'lead-add') {
      e.preventDefault();
      const fd = new FormData(form);
      const contact = String(fd.get('contact') || '').trim();
      const name = String(fd.get('name') || '').trim();
      if (!contact) { toast(t('crm.contact') + ' — required', 'warn'); return; }
      api('/leads', { method: 'POST', body: { contact: contact, name: name || undefined } })
        .then((r) => {
          if (r.ok) {
            form.reset();
            toast(r.data && r.data.created === false ? t('crm.skipped', { n: 1 }) : t('toast.saved'), r.data && r.data.created === false ? 'info' : 'success');
            loadCrm({ silent: true });
          }
        });
      return;
    }

    if (kind === 'lead-import') {
      e.preventDefault();
      const ta = form.querySelector('textarea[name="rows"]');
      let rows = null;
      try { rows = JSON.parse(ta && ta.value ? ta.value : 'null'); } catch (err) { rows = undefined; }
      if (rows === undefined || rows == null) { toast(t('crm.importTitle') + ' — JSON?', 'warn'); return; }
      api('/leads/import', { method: 'POST', body: { rows: rows, source: 'dashboard' } })
        .then((r) => {
          if (r.ok) {
            if (ta) ta.value = '';
            const rep = r.data || {};
            toast(t('crm.imported', { n: rep.imported || 0 }) + ' · ' + t('crm.skipped', { n: rep.skipped || 0 }) + (rep.invalid && rep.invalid.length ? ' · ' + t('crm.invalid', { n: rep.invalid.length }) : ''), 'success');
            loadCrm({ silent: true });
          }
        });
      return;
    }

    if (kind === 'broadcast') {
      e.preventDefault();
      const ta = form.querySelector('textarea[name="text"]');
      const text = ta ? ta.value.trim() : '';
      if (!text) return;
      api('/broadcast', { method: 'POST', body: { text: text } })
        .then((r) => {
          if (r.ok) {
            if (ta) ta.value = '';
            toast(t('toast.broadcastQueued'), 'info');
            loadOwner({ silent: true });
          }
        });
      return;
    }

    if (kind === 'setting-edit') {
      e.preventDefault();
      const key = form.getAttribute('data-key');
      const input = form.querySelector('input[name="value"]');
      if (!key || !input) return;
      api('/settings', { method: 'PUT', body: { key: key, value: input.value } })
        .then((r) => { if (r.ok) { ownerEditSetting = null; toast(t('toast.saved'), 'success'); loadOwner({ silent: true }); } });
      return;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'theme-switch') setTheme(e.target.checked ? 'dark' : 'light');
  });

  /* ─────────────────────────── static bindings ─────────────────────────── */
  function bindStatic() {
    const sel = $('#lang-select');
    if (sel) sel.addEventListener('change', () => setLang(sel.value));
    const unlockBtn = $('#btn-unlock');
    if (unlockBtn) unlockBtn.addEventListener('click', () => {
      if (state.key) { location.hash = '#/owner'; }
      else openKeyModal();
    });
    const keyForm = $('#key-form');
    if (keyForm) keyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#key-input');
      const val = input ? input.value : '';
      tryUnlock(val).then((ok) => { if (ok) { if (input) input.value = ''; closeKeyModal(); } });
    });
    const keyClear = $('#key-clear');
    if (keyClear) keyClear.addEventListener('click', () => { clearOwnerKey(); });
    const search = $('#market-search');
    if (search) {
      search.addEventListener('input', debounce(() => {
        state.market.q = search.value.trim();
        state.market.page = 0;
        if (state.route === 'market') loadMarket({ silent: true });
      }, 300));
    }
    const newBtn = $('#btn-new-product');
    if (newBtn) newBtn.addEventListener('click', () => {
      state.market.formOpen = !state.market.formOpen;
      state.market.editing = null;
      loadMarket({ silent: true });
      if (state.market.formOpen) {
        const card = $('#new-product-card');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    window.addEventListener('hashchange', onRoute);
  }

  /* ─────────────────────────── service worker ─────────────────────────── */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline shell optional */ });
    });
  }

  /* ─────────────────────────── boot ─────────────────────────── */
  function cloneBottomNav() {
    const nav = $('#nav');
    if (!nav || $('#bottom-nav')) return;
    const bn = nav.cloneNode(true);
    bn.id = 'bottom-nav';
    bn.className = 'bottom-nav';
    bn.removeAttribute('aria-label');
    bn.setAttribute('aria-label', 'Dashboard tabs');
    document.body.appendChild(bn);
  }
  function init() {
    document.documentElement.dataset.theme = state.theme;
    cloneBottomNav();
    applyI18n();
    bindStatic();
    registerSW();
    connectSSE();
    fetchHealth();
    fetchBrand();
    onRoute();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
