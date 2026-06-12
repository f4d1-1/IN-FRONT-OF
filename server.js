// ═══════════════════════════════════════════════════════════
//  IN FRONT OF.. — Express API Server
// ═══════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const DB = require('./db');

// Middleware to require Barista authorization
async function requireBaristaAuth(req, res, next) {
    // Check Authorization header or token query parameter (for SSE)
    const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }
    
    try {
        const correctToken = await DB.getSetting('active_barista_token');
        if (token === correctToken) {
            next();
        } else {
            return res.status(403).json({ success: false, error: 'Forbidden: Invalid token' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname), {
    extensions: ['html'],
    index: 'index.html'
}));

// ══════════════════════════════════════
//  SSE (Server-Sent Events) Hub
// ══════════════════════════════════════

const sseClients = {
    barista: [],      // All barista dashboard connections
    orders: new Map() // tracking_code -> [client connections]
};

function sendToBarista(event, data) {
    sseClients.barista.forEach(res => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    });
}

function sendToOrderTrackers(tracking_code, event, data) {
    const clients = sseClients.orders.get(tracking_code) || [];
    clients.forEach(res => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    });
}

// ── SSE: Barista stream ──
app.get('/api/sse/barista', requireBaristaAuth, (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write(':\n\n'); // comment to establish connection

    sseClients.barista.push(res);
    console.log(`☕ Barista SSE connected (total: ${sseClients.barista.length})`);

    req.on('close', () => {
        sseClients.barista = sseClients.barista.filter(c => c !== res);
        console.log(`☕ Barista SSE disconnected (total: ${sseClients.barista.length})`);
    });
});

// ── SSE: Order tracking stream ──
app.get('/api/sse/order/:trackingCode', async (req, res) => {
    const tc = req.params.trackingCode.toUpperCase();
    
    try {
        const order = await DB.getOrderByTracking(tc);
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // Security Check: Customer token or Barista authorization
        const token = req.query.token;
        const authHeader = req.headers['authorization'];
        const baristaToken = authHeader && authHeader.split(' ')[1];
        const correctBaristaToken = await DB.getSetting('active_barista_token');
        const isBarista = baristaToken && baristaToken === correctBaristaToken;

        if (!isBarista && (!token || token !== order.secure_token)) {
            return res.status(403).json({ success: false, error: 'Forbidden: Access denied' });
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.write(':\n\n');

        if (!sseClients.orders.has(tc)) sseClients.orders.set(tc, []);
        sseClients.orders.get(tc).push(res);

        req.on('close', () => {
            const clients = sseClients.orders.get(tc) || [];
            sseClients.orders.set(tc, clients.filter(c => c !== res));
            if (sseClients.orders.get(tc).length === 0) sseClients.orders.delete(tc);
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════
//  MENU API
// ══════════════════════════════════════

app.get('/api/menu', async (req, res) => {
    try {
        const items = await DB.getAllMenuItems();
        res.json({ success: true, items });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/menu/:id/toggle', async (req, res) => {
    try {
        const { available } = req.body;
        await DB.toggleMenuItemAvailability(req.params.id, available);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════
//  ORDER API
// ══════════════════════════════════════

// Place a new order
app.post('/api/orders', async (req, res) => {
    try {
        const { items, notes, promo_code, customer_name, customer_phone } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Items are required' });
        }

        // Calculate totals
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const PROMOS = { INFO10: 10, FIRSTSIP: 15 };
        const promoPercent = PROMOS[(promo_code || '').toUpperCase()] || 0;
        const discount = Math.round(subtotal * promoPercent / 100);
        const total = subtotal - discount;

        const order = await DB.createOrder({
            items, subtotal, discount, total,
            notes, promo_code, customer_name, customer_phone
        });

        // Notify barista via SSE
        sendToBarista('new_order', order);

        console.log(`📝 New order: ${order.order_number} (${order.tracking_code}) — ${total} SAR`);
        res.json({ success: true, order });
    } catch (err) {
        console.error('Order creation error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Track order by tracking code
app.get('/api/orders/:trackingCode', async (req, res) => {
    try {
        const order = await DB.getOrderByTracking(req.params.trackingCode.toUpperCase());
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        // Security Check: Customer token or Barista authorization
        const token = req.query.token;
        const authHeader = req.headers['authorization'];
        const baristaToken = authHeader && authHeader.split(' ')[1];
        const correctBaristaToken = await DB.getSetting('active_barista_token');
        const isBarista = baristaToken && baristaToken === correctBaristaToken;

        if (!isBarista && (!token || token !== order.secure_token)) {
            return res.status(403).json({ success: false, error: 'Forbidden: Access denied' });
        }

        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Cancel order by tracking code
app.put('/api/orders/:trackingCode/cancel', async (req, res) => {
    try {
        const order = await DB.getOrderByTracking(req.params.trackingCode.toUpperCase());
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        // Security Check: Customer token or Barista authorization
        const token = req.query.token || req.body.token;
        const authHeader = req.headers['authorization'];
        const baristaToken = authHeader && authHeader.split(' ')[1];
        const correctBaristaToken = await DB.getSetting('active_barista_token');
        const isBarista = baristaToken && baristaToken === correctBaristaToken;

        if (!isBarista && (!token || token !== order.secure_token)) {
            return res.status(403).json({ success: false, error: 'Forbidden: Access denied' });
        }

        const result = await DB.cancelOrder(req.params.trackingCode.toUpperCase());
        if (result.error) return res.status(400).json({ success: false, error: result.error });

        // Notify barista and order trackers
        sendToBarista('order_update', result.order);
        sendToOrderTrackers(req.params.trackingCode.toUpperCase(), 'status_update', result.order);

        console.log(`❌ Order cancelled: ${result.order.order_number}`);
        res.json({ success: true, order: result.order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════
//  BARISTA API
// ══════════════════════════════════════

// PIN authentication
app.post('/api/barista/auth', async (req, res) => {
    try {
        const { pin } = req.body;
        const correctPin = process.env.BARISTA_PIN || await DB.getSetting('barista_pin') || '1234';
        if (pin === correctPin) {
            // Simple token (good enough for local/single-store use)
            const token = Buffer.from(`barista_${Date.now()}_${Math.random()}`).toString('base64');
            await DB.setSetting('active_barista_token', token);
            res.json({ success: true, token });
        } else {
            res.status(401).json({ success: false, error: 'Invalid PIN' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get active orders
app.get('/api/barista/orders', requireBaristaAuth, async (req, res) => {
    try {
        const orders = await DB.getActiveOrders();
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get today's orders (all statuses)
app.get('/api/barista/orders/today', requireBaristaAuth, async (req, res) => {
    try {
        const orders = await DB.getTodayOrders();
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update order status
app.put('/api/barista/orders/:id/status', requireBaristaAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const order = await DB.updateOrderStatus(parseInt(req.params.id), status);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        // Notify via SSE
        sendToBarista('order_update', order);
        sendToOrderTrackers(order.tracking_code, 'status_update', order);

        console.log(`🔄 Order ${order.order_number} → ${status}`);
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update barista note (delay/custom updates)
app.put('/api/barista/orders/:id/note', requireBaristaAuth, async (req, res) => {
    try {
        const { note } = req.body;
        const order = await DB.updateOrderBaristaNote(parseInt(req.params.id), note);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

        // Notify via SSE
        sendToBarista('order_update', order);
        sendToOrderTrackers(order.tracking_code, 'status_update', order);

        console.log(`💬 Order ${order.order_number} note updated: "${note}"`);
        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all orders (history)
app.get('/api/barista/orders/history', requireBaristaAuth, async (req, res) => {
    try {
        const orders = await DB.getAllOrders();
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get today's stats
app.get('/api/barista/stats', requireBaristaAuth, async (req, res) => {
    try {
        const stats = await DB.getTodayStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update barista PIN
app.put('/api/barista/pin', requireBaristaAuth, async (req, res) => {
    try {
        const { current_pin, new_pin } = req.body;
        const correctPin = await DB.getSetting('barista_pin');
        if (current_pin !== correctPin) {
            return res.status(401).json({ success: false, error: 'Current PIN is incorrect' });
        }
        if (!new_pin || new_pin.length < 4) {
            return res.status(400).json({ success: false, error: 'New PIN must be at least 4 digits' });
        }
        await DB.setSetting('barista_pin', new_pin);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════
//  REVIEWS API
// ══════════════════════════════════════

app.get('/api/reviews', async (req, res) => {
    try {
        const reviews = await DB.getAllReviews();
        res.json({ success: true, reviews });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const { name, rating, text_en, text_ar } = req.body;
        if (!name || !rating) {
            return res.status(400).json({ success: false, error: 'Name and rating are required' });
        }
        const review = await DB.createReview({ name, rating: Math.min(5, Math.max(1, rating)), text_en: text_en || '', text_ar: text_ar || text_en || '' });
        res.json({ success: true, review });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════
//  SPA FALLBACK
// ══════════════════════════════════════

app.get('/barista', (req, res) => {
    res.sendFile(path.join(__dirname, 'barista.html'));
});

// ══════════════════════════════════════
//  START
// ══════════════════════════════════════

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║                                                   ║
  ║     ☕  IN FRONT OF.. — Server Running            ║
  ║                                                   ║
  ║     Customer:  http://localhost:${PORT}              ║
  ║     Barista:   http://localhost:${PORT}/barista       ║
  ║                                                   ║
  ║     Default Barista PIN: 1234                     ║
  ║                                                   ║
  ╚═══════════════════════════════════════════════════╝
        `);
    });
}

// Export for Vercel Serverless Function compatibility
module.exports = app;
