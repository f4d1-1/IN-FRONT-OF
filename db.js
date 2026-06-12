// ═══════════════════════════════════════════════════════════
//  IN FRONT OF.. — Database Layer (Pure JS JSON / Firebase Firestore Hybrid)
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Choose Database Mode ──
const isFirebaseMode = !!process.env.FIREBASE_SERVICE_ACCOUNT;
let firestore = null;

if (isFirebaseMode) {
    try {
        const admin = require('firebase-admin');
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        // Prevent double-initialization in hot-reloads/serverless environments
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        firestore = admin.firestore();
        console.log('🔥 Connected to Firebase Firestore Database successfully.');
    } catch (err) {
        console.error('❌ Failed to initialize Firebase Admin SDK. Falling back to local JSON database.', err);
    }
} else {
    console.log('📦 Operating in Local Database Mode (data/db.json).');
}

// ── Local Database In-Memory State ──
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'db.json');

let localState = {
    settings: {
        barista_pin: '1234',
        store_name: 'IN FRONT OF..',
        store_phone: '0537874042',
        next_order_number: '1'
    },
    menu_items: [],
    orders: [],
    reviews: []
};

// ── Helper to save local state ──
function saveLocal() {
    fs.writeFileSync(DB_PATH, JSON.stringify(localState, null, 2), 'utf8');
}

// ── Seed Lists ──
function getSeedMenuItems() {
    return [
        // ── Signatures (Featured) ──
        { id: 1, name_en: 'Matilda Cake', name_ar: 'ماتيلدا كيك', desc_en: 'Signature double chocolate fudge cake served with warm chocolate sauce. Pure indulgence.', desc_ar: 'كيكة الشوكولاتة الهشة والشهيرة بصوص الشوكولاتة الدافئ.', price: 26, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&auto=format&fit=crop', tags: 'gluten dairy', is_signature: 1, is_available: 1, sort_order: 1 },
        { id: 2, name_en: 'Mango Truffle', name_ar: 'مانجو ترافل', desc_en: 'Creamy mango truffle layers with fresh mango puree, fresh flower garnish. Bright and tropical.', desc_ar: 'طبقات المانجو ترافل الغنية بالكريمة وهريس المانجو الطازج.', price: 24, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 1, is_available: 1, sort_order: 2 },
        { id: 3, name_en: 'Iced Latte', name_ar: 'لاتيه بارد', desc_en: 'Rich espresso blended with chilled whole milk over ice. Simple and refreshing.', desc_ar: 'إسبريسو غني ممزوج مع حليب كامل الدسم مبرد على الثلج.', price: 17, category: 'cold', image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 1, is_available: 1, sort_order: 3 },

        // ── Hot Drinks ──
        { id: 4, name_en: 'Espresso', name_ar: 'إسبريسو', desc_en: 'Double shot of our signature blend espresso.', desc_ar: 'جرعة مزدوجة من إسبريسو خلطتنا المميزة.', price: 10, category: 'hot', image_url: 'https://images.unsplash.com/photo-1510707577719-fa7c182024de?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 10 },
        { id: 5, name_en: 'Cortado', name_ar: 'كورتادو', desc_en: 'Equal parts espresso and warm silky milk.', desc_ar: 'أجزاء متساوية من الإسبريسو والحليب الدافئ الحريري.', price: 13, category: 'hot', image_url: 'https://images.unsplash.com/photo-1570968915860-54d5c301fc9f?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 11 },
        { id: 6, name_en: 'Flat White', name_ar: 'فلات وايت', desc_en: 'Double ristretto with micro-foam steamed milk.', desc_ar: 'دبل ريستريتو مع حليب كامل الدسم مبخر برغوة خفيفة.', price: 15, category: 'hot', image_url: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 12 },
        { id: 7, name_en: 'Cappuccino', name_ar: 'كابتشينو', desc_en: 'Espresso with steamed milk and a rich layer of foam.', desc_ar: 'إسبريسو مع حليب مبخر ورغوة حليب غنية.', price: 15, category: 'hot', image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 13 },
        { id: 8, name_en: 'Latte', name_ar: 'لاتيه', desc_en: 'Espresso with steamed milk and a light foam layer.', desc_ar: 'إسبريسو مع حليب مبخر وطبقة رغوة خفيفة.', price: 16, category: 'hot', image_url: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 14 },
        { id: 9, name_en: 'Americano', name_ar: 'أمريكانو', desc_en: 'Espresso shot diluted with hot water.', desc_ar: 'إسبريسو مخفف بالماء الساخن.', price: 12, category: 'hot', image_url: 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 15 },
        { id: 10, name_en: 'Coffee of the Day', name_ar: 'قهوة اليوم', desc_en: 'Freshly brewed black drip coffee.', desc_ar: 'قهوة سوداء مقطرة طازجة.', price: 10, category: 'hot', image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 16 },
        { id: 11, name_en: 'V60 Pour Over', name_ar: 'قهوة مقطرة V60', desc_en: 'Hand-poured filter coffee with clean and bright notes.', desc_ar: 'قهوة مقطرة يدوياً بنكهة غنية ونظيفة.', price: 16, category: 'hot', image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 17 },
        { id: 12, name_en: 'Hot Chocolate', name_ar: 'شوكولاتة ساخنة', desc_en: 'Rich Belgian chocolate with steamed milk.', desc_ar: 'شوكولاتة بلجيكية غنية مع حليب مبخر.', price: 17, category: 'hot', image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 18 },
        { id: 13, name_en: 'Spanish Latte', name_ar: 'سبانيش لاتيه', desc_en: 'Double shot espresso, sweet condensed milk, steamed milk.', desc_ar: 'دبل شوت إسبريسو، حليب مكثف محلى، حليب مبخر.', price: 17, category: 'hot', image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 19 },

        // ── Cold Drinks ──
        { id: 14, name_en: 'Iced Drip Coffee', name_ar: 'قهوة مقطرة باردة', desc_en: 'Chilled hand-poured single-origin coffee served over ice.', desc_ar: 'قهوة مقطرة باردة أحادية المصدر تُقدم فوق الثلج.', price: 17, category: 'cold', image_url: 'https://images.unsplash.com/photo-1513530534585-c7b1394c6d51?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 30 },
        { id: 15, name_en: 'Iced Americano', name_ar: 'أمريكانو بارد', desc_en: 'Chilled espresso shot diluted with ice and cold water.', desc_ar: 'إسبريسو بارد مخفف بالماء والثلج.', price: 13, category: 'cold', image_url: 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 31 },
        { id: 16, name_en: 'Iced Coffee of the Day', name_ar: 'قهوة اليوم بارد', desc_en: 'Chilled brew of our daily single-origin filter selection.', desc_ar: 'قهوة اليوم المفلترة والباردة المفضلة لدينا.', price: 11, category: 'cold', image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 32 },
        { id: 17, name_en: 'Iced Spanish Latte', name_ar: 'سبانيش لاتيه بارد', desc_en: 'Espresso, condensed milk, whole milk over ice.', desc_ar: 'اسبريسو، حليب مكثف محلى، وحليب على الثلج.', price: 18, category: 'cold', image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 33 },
        { id: 18, name_en: 'Alfreedo', name_ar: 'ألفريدو', desc_en: 'Special cold shaken signature coffee with sweet tones.', desc_ar: 'قهوة ألفريدو الباردة المخفوقة بطريقتنا الخاصة.', price: 15, category: 'cold', image_url: 'https://images.unsplash.com/photo-1513530534585-c7b1394c6d51?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 34 },
        { id: 19, name_en: 'Hibiscus Tea', name_ar: 'كركديه مثلج', desc_en: 'Slow-brewed hibiscus flowers, served sweet and cold.', desc_ar: 'كركديه بارد ومنعش محضر ببطء مع نكهات حلوة.', price: 18, category: 'cold', image_url: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 35 },
        { id: 20, name_en: 'Iced Matcha Latte', name_ar: 'ماتشا بارد', desc_en: 'Ceremonial-grade Japanese Uji Matcha with cold milk over ice.', desc_ar: 'ماتشا يابانية فاخرة مع حليب بارد وثلج.', price: 19, category: 'cold', image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=300&auto=format&fit=crop', tags: 'dairy', is_signature: 0, is_available: 1, sort_order: 36 },
        { id: 21, name_en: 'Piña Colada', name_ar: 'بينا كولادا مثلج', desc_en: 'Pineapple and coconut blended iced beverage, summer vibe.', desc_ar: 'مشروب جوز الهند والأناناس البارد والمنعش.', price: 19, category: 'cold', image_url: 'https://images.unsplash.com/photo-1526318896980-cf78c088247c?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 37 },
        { id: 22, name_en: 'Passion Fruit Mojito', name_ar: 'موهيتو باشن فروت', desc_en: 'Chilled soda with fresh passion fruit, mint, and lime.', desc_ar: 'مشروب غازي بارد مع الباشن فروت، النعناع والليمون.', price: 18, category: 'cold', image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 38 },
        { id: 23, name_en: 'Water', name_ar: 'مياه معدنية', desc_en: 'Pure local bottled mineral water.', desc_ar: 'مياه معدنية محلية نقية.', price: 2, category: 'cold', image_url: 'https://images.unsplash.com/photo-1548839140-29a886455ac5?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 39 },

        // ── Desserts (Bakery category) ──
        { id: 24, name_en: 'Dolce Cake', name_ar: 'دولتشي كيك', desc_en: 'Rich chocolate sponge cake with caramel and cream layers.', desc_ar: 'كيكة الإسفنج بالشوكولاتة مع طبقات الكراميل والكريمة الغنية.', price: 25, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1508737027454-e6454ef45afd?w=300&auto=format&fit=crop', tags: 'gluten dairy', is_signature: 0, is_available: 1, sort_order: 50 },
        { id: 25, name_en: 'Cheesecake Madrid', name_ar: 'تشيز كيك مدريد', desc_en: 'San Sebastian style baked cheesecake with a burnt top and creamy center.', desc_ar: 'تشيز كيك مخبوز على طريقة سان سيباستيان بقوام كريمي ولذيذ.', price: 19, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1524351199679-46cddf530c04?w=300&auto=format&fit=crop', tags: 'gluten dairy', is_signature: 0, is_available: 1, sort_order: 51 },
        { id: 26, name_en: 'Cheesecake Berries', name_ar: 'تشيز كيك التوت', desc_en: 'Creamy cheesecake topped with fresh forest berry compote.', desc_ar: 'تشيز كيك كلاسيكي مغطى بصوص التوت البري الطازج.', price: 22, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1524351199679-46cddf530c04?w=300&auto=format&fit=crop', tags: 'gluten dairy', is_signature: 0, is_available: 1, sort_order: 52 },
        { id: 27, name_en: 'Tiramisu', name_ar: 'تيراميسو', desc_en: 'Classic Italian tiramisu with coffee-soaked ladyfingers and mascarpone.', desc_ar: 'تيراميسو إيطالي كلاسيكي بطبقات الكاكاو والقهوة والماسكاربوني.', price: 26, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=300&auto=format&fit=crop', tags: 'gluten dairy', is_signature: 0, is_available: 1, sort_order: 53 },
        { id: 28, name_en: 'Brownies', name_ar: 'براونيز الشوكولاتة', desc_en: 'Fudgy, dense Belgian chocolate brownies.', desc_ar: 'قطع براونيز هشة وغنية بالشوكولاتة البلجيكية الفاخرة.', price: 14, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&auto=format&fit=crop', tags: 'gluten dairy', is_signature: 0, is_available: 1, sort_order: 54 },
        { id: 29, name_en: 'Cookies', name_ar: 'كوكيز كلاسيك', desc_en: 'Soft-baked chocolate chip cookie with a gooey center.', desc_ar: 'كوكيز كلاسيكي بقطع الشوكولاتة الذائبة وهش من الأطراف.', price: 10, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=300&auto=format&fit=crop', tags: 'gluten dairy', is_signature: 0, is_available: 1, sort_order: 55 },
        { id: 30, name_en: 'Pecan Pudding', name_ar: 'بودينق البيكان', desc_en: 'Warm brioche bread pudding with sticky pecan caramel sauce and vanilla ice cream.', desc_ar: 'بودينق البيكان الدافئ الغني بصوص كراميل الزبدة والآيس كريم.', price: 19, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=300&auto=format&fit=crop', tags: 'gluten dairy nuts', is_signature: 0, is_available: 1, sort_order: 56 },
        { id: 31, name_en: 'Coffee Day Box', name_ar: 'بوكس قهوة اليوم', desc_en: '1-liter box of cold coffee of the day, includes cups and ice, perfect for sharing.', desc_ar: 'بوكس ١ لتر من قهوة اليوم الباردة، يشمل الكاسات والثلج. مثالي للمشاركة.', price: 38, category: 'bakery', image_url: 'https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=300&auto=format&fit=crop', tags: '', is_signature: 0, is_available: 1, sort_order: 57 }
    ];
}

function getSeedReviews() {
    return [
        { id: 1, name: 'Mohammed A.', rating: 5, text_en: 'The Matilda Cake is out of this world, and the forest green branding looks incredible!', text_ar: 'ماتيلدا كيك خيالية، والديكور والهوية الجديدة باللون الأخضر طالعين يجننوا!', created_at: '2026-06-12 10:00:00' },
        { id: 2, name: 'Sarah M.', rating: 5, text_en: 'Love the new tracking system. Ordered my Mango Truffle and Iced Matcha, walked in right as it was ready.', text_ar: 'حبيت نظام تتبع الطلب الجديد. طلبت المانجو ترافل وماتشا واستلمتهم فوراً.', created_at: '2026-06-12 09:30:00' },
        { id: 3, name: 'Fahad K.', rating: 5, text_en: 'In Front Of has always been my favorite spot in Riyadh. Great coffee and top tier sweets.', text_ar: 'إن فرونت أوف مكاني المفضل في الرياض دائماً. قهوة ممتازة وحلويات فاخرة.', created_at: '2026-06-12 09:00:00' },
        { id: 4, name: 'Noura S.', rating: 5, text_en: 'The Iced Spanish Latte and Cookies combination is pure perfection. 10/10.', text_ar: 'كوكيز مع سبانيش لاتيه بارد تمازج مثالي جداً. ١٠/١٠.', created_at: '2026-06-12 08:30:00' }
    ];
}

// ── Seed Firestore helper ──
async function seedFirebaseIfEmpty() {
    const configRef = firestore.collection('settings').doc('config');
    const configDoc = await configRef.get();
    
    if (!configDoc.exists) {
        console.log('🌱 Seeding Firebase Config...');
        await configRef.set({
            barista_pin: '1234',
            store_name: 'IN FRONT OF..',
            store_phone: '0537874042',
            next_order_number: '1'
        });
    }
    
    const menuItemsSnap = await firestore.collection('menu_items').limit(1).get();
    if (menuItemsSnap.empty) {
        console.log('🌱 Seeding Firebase Menu Items...');
        const batch = firestore.batch();
        const defaultMenuItems = getSeedMenuItems();
        defaultMenuItems.forEach(item => {
            const ref = firestore.collection('menu_items').doc(String(item.id));
            batch.set(ref, item);
        });
        await batch.commit();
    }
    
    const reviewsSnap = await firestore.collection('reviews').limit(1).get();
    if (reviewsSnap.empty) {
        console.log('🌱 Seeding Firebase Reviews...');
        const batch = firestore.batch();
        const defaultReviews = getSeedReviews();
        defaultReviews.forEach(rev => {
            const ref = firestore.collection('reviews').doc(String(rev.id));
            batch.set(ref, rev);
        });
        await batch.commit();
    }
}

// ── Seed Local helper ──
function seedLocalIfEmpty() {
    console.log('📦 Seeding local database with IN FRONT OF.. menu items and reviews...');
    localState.menu_items = getSeedMenuItems();
    localState.reviews = getSeedReviews();
    saveLocal();
}

function loadLocal() {
    if (fs.existsSync(DB_PATH)) {
        try {
            localState = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        } catch (err) {
            console.error('Error reading database file, using default state:', err);
            seedLocalIfEmpty();
        }
    } else {
        seedLocalIfEmpty();
    }
}

// ── Init load ──
if (!isFirebaseMode || !firestore) {
    loadLocal();
} else {
    seedFirebaseIfEmpty().catch(err => console.error('Error seeding Firebase:', err));
}

// ── Helper generators ──
function generateTrackingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// ── GETTER / SETTER Settings ──
async function getSetting(key) {
    if (isFirebaseMode && firestore) {
        const doc = await firestore.collection('settings').doc('config').get();
        return doc.exists ? doc.data()[key] : null;
    } else {
        return localState.settings[key] || null;
    }
}

async function setSetting(key, value) {
    if (isFirebaseMode && firestore) {
        await firestore.collection('settings').doc('config').set({ [key]: String(value) }, { merge: true });
    } else {
        localState.settings[key] = String(value);
        saveLocal();
    }
}

// ── MENU QUERIES ──
async function getAllMenuItems() {
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('menu_items')
            .where('is_available', '==', 1)
            .get();
        const items = [];
        snap.forEach(doc => items.push(doc.data()));
        return items.sort((a, b) => a.sort_order - b.sort_order);
    } else {
        return localState.menu_items.filter(i => i.is_available === 1).sort((a, b) => a.sort_order - b.sort_order);
    }
}

async function getMenuItemsByCategory(category) {
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('menu_items')
            .where('is_available', '==', 1)
            .where('category', '==', category)
            .get();
        const items = [];
        snap.forEach(doc => items.push(doc.data()));
        return items.sort((a, b) => a.sort_order - b.sort_order);
    } else {
        return localState.menu_items.filter(i => i.is_available === 1 && i.category === category).sort((a, b) => a.sort_order - b.sort_order);
    }
}

async function toggleMenuItemAvailability(id, available) {
    const numId = parseInt(id);
    if (isFirebaseMode && firestore) {
        await firestore.collection('menu_items').doc(String(numId)).set({ is_available: available ? 1 : 0 }, { merge: true });
    } else {
        const item = localState.menu_items.find(i => i.id === numId);
        if (item) {
            item.is_available = available ? 1 : 0;
            saveLocal();
        }
    }
}

// ── ORDER QUERIES ──
async function createOrder({ items, subtotal, discount, total, notes, promo_code, customer_name, customer_phone }) {
    let order_number;
    
    if (isFirebaseMode && firestore) {
        const configRef = firestore.collection('settings').doc('config');
        await firestore.runTransaction(async (transaction) => {
            const doc = await transaction.get(configRef);
            let nextNum = 1;
            if (doc.exists && doc.data().next_order_number) {
                nextNum = parseInt(doc.data().next_order_number, 10);
            }
            order_number = `INFO-${String(nextNum).padStart(4, '0')}`;
            transaction.set(configRef, { next_order_number: String(nextNum + 1) }, { merge: true });
        });
    } else {
        const num = parseInt(localState.settings.next_order_number, 10);
        localState.settings.next_order_number = String(num + 1);
        saveLocal();
        order_number = `INFO-${String(num).padStart(4, '0')}`;
    }

    let tracking_code = generateTrackingCode();
    
    if (isFirebaseMode && firestore) {
        let exists = true;
        while (exists) {
            const snap = await firestore.collection('orders').where('tracking_code', '==', tracking_code).get();
            if (snap.empty) exists = false;
            else tracking_code = generateTrackingCode();
        }
    } else {
        while (localState.orders.some(o => o.tracking_code === tracking_code)) {
            tracking_code = generateTrackingCode();
        }
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const secure_token = crypto.randomBytes(16).toString('hex');

    const newOrder = {
        id: Date.now(), // Numeric ID for local state mapping
        order_number,
        tracking_code,
        secure_token,
        status: 'pending',
        items_json: JSON.stringify(items),
        items,
        subtotal,
        discount,
        total,
        notes: notes || '',
        promo_code: promo_code || '',
        customer_name: customer_name || '',
        customer_phone: customer_phone || '',
        created_at: nowStr,
        updated_at: nowStr
    };

    if (isFirebaseMode && firestore) {
        await firestore.collection('orders').doc(tracking_code).set(newOrder);
    } else {
        localState.orders.push(newOrder);
        saveLocal();
    }

    return newOrder;
}

async function getOrderById(id) {
    const numId = parseInt(id);
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('orders').where('id', '==', numId).limit(1).get();
        if (snap.empty) return null;
        const order = snap.docs[0].data();
        if (order && !order.items) order.items = JSON.parse(order.items_json);
        return order;
    } else {
        const order = localState.orders.find(o => o.id === numId);
        if (order && !order.items) order.items = JSON.parse(order.items_json);
        return order || null;
    }
}

async function getOrderByTracking(tracking_code) {
    const code = tracking_code.toUpperCase();
    if (isFirebaseMode && firestore) {
        const doc = await firestore.collection('orders').doc(code).get();
        if (!doc.exists) return null;
        const order = doc.data();
        if (order && !order.items) order.items = JSON.parse(order.items_json);
        return order;
    } else {
        const order = localState.orders.find(o => o.tracking_code === code);
        if (order && !order.items) order.items = JSON.parse(order.items_json);
        return order || null;
    }
}

async function getActiveOrders() {
    const activeStatuses = ['pending', 'preparing', 'ready'];
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('orders')
            .where('status', 'in', activeStatuses)
            .get();
        const orders = [];
        snap.forEach(doc => {
            const order = doc.data();
            if (!order.items) order.items = JSON.parse(order.items_json);
            orders.push(order);
        });
        return orders.sort((a, b) => a.created_at.localeCompare(b.created_at));
    } else {
        return localState.orders
            .filter(o => activeStatuses.includes(o.status))
            .map(o => {
                if (!o.items) o.items = JSON.parse(o.items_json);
                return o;
            })
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
}

async function getTodayOrders() {
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('orders')
            .where('created_at', '>=', todayStr + ' 00:00:00')
            .where('created_at', '<=', todayStr + ' 23:59:59')
            .get();
        const orders = [];
        snap.forEach(doc => {
            const order = doc.data();
            if (!order.items) order.items = JSON.parse(order.items_json);
            orders.push(order);
        });
        return orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else {
        return localState.orders
            .filter(o => o.created_at.startsWith(todayStr))
            .map(o => {
                if (!o.items) o.items = JSON.parse(o.items_json);
                return o;
            })
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
}

async function updateOrderStatus(id, status) {
    const numId = parseInt(id);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('orders').where('id', '==', numId).limit(1).get();
        if (snap.empty) return null;
        const docRef = snap.docs[0].ref;
        await docRef.update({ status, updated_at: nowStr });
        const updatedDoc = await docRef.get();
        const order = updatedDoc.data();
        if (order && !order.items) order.items = JSON.parse(order.items_json);
        return order;
    } else {
        const order = localState.orders.find(o => o.id === numId);
        if (order) {
            order.status = status;
            order.updated_at = nowStr;
            saveLocal();
            if (!order.items) order.items = JSON.parse(order.items_json);
            return order;
        }
        return null;
    }
}

async function cancelOrder(tracking_code) {
    const code = tracking_code.toUpperCase();
    const order = await getOrderByTracking(code);
    if (!order) return { error: 'Order not found' };
    if (order.status !== 'pending') return { error: 'Only pending orders can be cancelled' };
    
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    order.status = 'cancelled';
    order.updated_at = nowStr;

    if (isFirebaseMode && firestore) {
        await firestore.collection('orders').doc(code).update({ status: 'cancelled', updated_at: nowStr });
    } else {
        saveLocal();
    }
    
    return { success: true, order };
}

async function getTodayStats() {
    const todayOrders = await getTodayOrders();
    
    const total_orders = todayOrders.length;
    const revenue = todayOrders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);

    const completedOrders = todayOrders.filter(o => o.status === 'completed');
    const completed_orders = completedOrders.length;

    let avg_prep_minutes = 0;
    if (completed_orders > 0) {
        const totalPrepMs = completedOrders.reduce((sum, o) => {
            const created = new Date(o.created_at.replace(' ', 'T') + 'Z');
            const updated = new Date(o.updated_at.replace(' ', 'T') + 'Z');
            return sum + (updated - created);
        }, 0);
        avg_prep_minutes = Math.round(totalPrepMs / (completed_orders * 60000));
    }

    return {
        total_orders,
        revenue,
        completed_orders,
        avg_prep_minutes
    };
}

// ── REVIEW QUERIES ──
async function getAllReviews() {
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('reviews').get();
        const reviews = [];
        snap.forEach(doc => reviews.push(doc.data()));
        return reviews.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else {
        return [...localState.reviews].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
}

async function createReview({ name, rating, text_en, text_ar }) {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    const newReview = {
        id: Date.now(),
        name,
        rating: Math.min(5, Math.max(1, rating)),
        text_en: text_en || '',
        text_ar: text_ar || text_en || '',
        created_at: nowStr
    };

    if (isFirebaseMode && firestore) {
        await firestore.collection('reviews').doc(String(newReview.id)).set(newReview);
    } else {
        localState.reviews.push(newReview);
        saveLocal();
    }
    return newReview;
}

async function updateOrderBaristaNote(id, note) {
    const numId = parseInt(id);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('orders').where('id', '==', numId).limit(1).get();
        if (snap.empty) return null;
        const docRef = snap.docs[0].ref;
        await docRef.update({ barista_note: note, updated_at: nowStr });
        const updatedDoc = await docRef.get();
        const order = updatedDoc.data();
        if (order && !order.items) order.items = JSON.parse(order.items_json);
        return order;
    } else {
        const order = localState.orders.find(o => o.id === numId);
        if (order) {
            order.barista_note = note;
            order.updated_at = nowStr;
            saveLocal();
            if (!order.items) order.items = JSON.parse(order.items_json);
            return order;
        }
        return null;
    }
}

async function getAllOrders() {
    if (isFirebaseMode && firestore) {
        const snap = await firestore.collection('orders').get();
        const orders = [];
        snap.forEach(doc => {
            const order = doc.data();
            if (!order.items) order.items = JSON.parse(order.items_json);
            orders.push(order);
        });
        return orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else {
        return localState.orders
            .map(o => {
                if (!o.items) o.items = JSON.parse(o.items_json);
                return o;
            })
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
}

// ── EXPORTS ──
module.exports = {
    db: {},
    getSetting,
    setSetting,
    getAllMenuItems,
    getMenuItemsByCategory,
    toggleMenuItemAvailability,
    createOrder,
    getOrderById,
    getOrderByTracking,
    getActiveOrders,
    getTodayOrders,
    updateOrderStatus,
    cancelOrder,
    getTodayStats,
    getAllReviews,
    createReview,
    updateOrderBaristaNote,
    getAllOrders,
};
