const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const { ensureSeedData } = require('./seed');

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());
// In production nginx serves /uploads directly from the shared volume; this also lets the
// backend serve it itself (used by the Vite dev proxy, and as a fallback in general).
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d' }));

app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/extras', require('./routes/extras'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/employee', require('./routes/employeeSelf'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use(errorHandler);

async function bootstrap() {
  // Retry a few times in case MySQL's own healthcheck passes just before it's fully
  // ready to accept application connections.
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await ensureSeedData();
      break;
    } catch (err) {
      if (attempt === 10) throw err;
      console.log(`Waiting for database... (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  app.listen(config.port, () => {
    console.log(`Backend listening on :${config.port}`);
  });
}

bootstrap();
