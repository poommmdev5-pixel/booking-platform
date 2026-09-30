SET NAMES utf8mb4;

CREATE TABLE admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SUPER_ADMIN','ADMIN') NOT NULL DEFAULT 'ADMIN',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  password_hash VARCHAR(255) NULL,
  preferred_locale ENUM('th','en','zh') NOT NULL DEFAULT 'th',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  booking_type ENUM('stay','session','stay_session') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE category_translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  locale ENUM('th','en','zh') NOT NULL,
  name VARCHAR(255) NOT NULL,
  UNIQUE KEY uniq_category_locale (category_id, locale),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  booking_type ENUM('stay','session','stay_session') NOT NULL,
  capacity INT NULL,
  min_stay_nights INT NULL,
  max_guests INT NOT NULL DEFAULT 1,
  location VARCHAR(255) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by INT NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (created_by) REFERENCES admins(id),
  INDEX idx_products_category (category_id),
  INDEX idx_products_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A named menu of price points a customer picks from at booking time. Meaning of
-- label/minutes depends on the product's booking_type: 'session' uses a free-text label
-- and is priced per unit (price × guests), capped per round by `unit_limit`; 'stay'
-- always has exactly one tier whose label is ignored in favor of a fixed "1 night" i18n
-- string; 'stay_session' requires `minutes` and the label is ignored in favor of a
-- locale-formatted duration (e.g. 90 -> "1h 30m"); both of those ignore `unit_limit`.
CREATE TABLE product_price_tiers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  label VARCHAR(100) NOT NULL,
  minutes INT NULL,
  price DECIMAL(10,2) NOT NULL,
  unit_limit INT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_price_tiers_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  locale ENUM('th','en','zh') NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tags VARCHAR(500),
  UNIQUE KEY uniq_product_locale (product_id, locale),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  url_thumbnail VARCHAR(500) NOT NULL,
  url_medium VARCHAR(500) NOT NULL,
  url_original VARCHAR(500) NOT NULL,
  is_cover TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_images_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extras: optional add-on services attached to one or more products (e.g. breakfast,
-- late checkout). Structured like a lightweight product: own translations + images.
CREATE TABLE extras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE extra_translations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  extra_id INT NOT NULL,
  locale ENUM('th','en','zh') NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  UNIQUE KEY uniq_extra_locale (extra_id, locale),
  FOREIGN KEY (extra_id) REFERENCES extras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE extra_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  extra_id INT NOT NULL,
  url_thumbnail VARCHAR(500) NOT NULL,
  url_medium VARCHAR(500) NOT NULL,
  url_original VARCHAR(500) NOT NULL,
  is_cover TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (extra_id) REFERENCES extras(id) ON DELETE CASCADE,
  INDEX idx_extra_images_extra (extra_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Many-to-many: which extras are offered alongside which products.
CREATE TABLE product_extras (
  product_id INT NOT NULL,
  extra_id INT NOT NULL,
  PRIMARY KEY (product_id, extra_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (extra_id) REFERENCES extras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employees: staff who can be assigned to work a session (see session_employees below).
CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE employee_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  url_thumbnail VARCHAR(500) NOT NULL,
  url_medium VARCHAR(500) NOT NULL,
  url_original VARCHAR(500) NOT NULL,
  is_cover TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_employee_images_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Session Booking: admin-defined, individually named time slots (e.g. a specific spa
-- appointment or showtime) that can be reserved by exactly one booking each — checked via
-- bookings.session_id at booking time, not a stored flag here.
CREATE TABLE product_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_sessions_product_date (product_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Many-to-many: which employees are staffed on a given session.
CREATE TABLE session_employees (
  session_id INT NOT NULL,
  employee_id INT NOT NULL,
  PRIMARY KEY (session_id, employee_id),
  FOREIGN KEY (session_id) REFERENCES product_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stay Booking calendar: admin works month-by-month, explicitly configuring the days
-- that should be open. An unconfigured day defaults closed (no row = no staff = not
-- bookable), same as a day explicitly flagged is_holiday — the flag just lets the admin
-- UI tell "deliberately closed" apart from "not set up yet".
CREATE TABLE stay_calendar_days (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  date DATE NOT NULL,
  is_holiday TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_stay_day (product_id, date),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_stay_days_product_date (product_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Which employees are on duty for a configured stay-calendar day. A stay booking must
-- pick one employee who is on duty (and not already booked elsewhere) on every night of
-- the requested range — mirrors session_employees, but per calendar day instead of round.
CREATE TABLE stay_day_employees (
  day_id INT NOT NULL,
  employee_id INT NOT NULL,
  PRIMARY KEY (day_id, employee_id),
  FOREIGN KEY (day_id) REFERENCES stay_calendar_days(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- For a plain 'stay' product, a whole month must be explicitly opened by the admin
-- before any of its days can be booked — there is no default-open month. Once a month
-- is open, individual days within it default open too, unless flagged a holiday.
-- (stay_session doesn't use this: its per-day staff assignment already opts each day
-- in individually, so a month-level gate would be redundant there.)
CREATE TABLE stay_open_months (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  month CHAR(7) NOT NULL,
  UNIQUE KEY uniq_stay_month (product_id, month),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(30) NOT NULL UNIQUE,
  product_id INT NOT NULL,
  customer_id INT NULL,
  session_id INT NULL,
  employee_id INT NULL,
  price_tier_id INT NULL,
  price_tier_label VARCHAR(100) NULL,
  booking_type ENUM('stay','session','stay_session') NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NULL,
  time_start VARCHAR(5) NULL,
  time_end VARCHAR(5) NULL,
  guests INT NOT NULL DEFAULT 1,
  guest_name VARCHAR(255) NOT NULL,
  guest_email VARCHAR(255) NOT NULL,
  guest_phone VARCHAR(50) NOT NULL,
  status ENUM('pending','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
  total_price DECIMAL(10,2) NOT NULL,
  note TEXT,
  cancel_reason VARCHAR(500),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (session_id) REFERENCES product_sessions(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (price_tier_id) REFERENCES product_price_tiers(id) ON DELETE SET NULL,
  INDEX idx_bookings_product_date (product_id, date_start, date_end),
  INDEX idx_bookings_product_slot (product_id, date_start, time_start),
  INDEX idx_bookings_status (status),
  INDEX idx_bookings_session (session_id),
  INDEX idx_bookings_employee_date (employee_id, date_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extras a customer added on to a booking. Name/price are snapshotted at booking time
-- (not joined live from `extras`) so a later price or translation change never alters
-- the amount a past customer was actually charged.
CREATE TABLE booking_extras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  extra_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (extra_id) REFERENCES extras(id),
  INDEX idx_booking_extras_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A booking's line items — one per price-tier/quantity chosen. 'stay' and 'stay_session'
-- bookings always have exactly one; a 'session' booking can have several (e.g. "Adult"
-- x2 + "Child" x1) sharing one reference, round and staff member — the whole checkout is
-- always a single row in `bookings`, never split across several. Label/price are
-- snapshotted at booking time, same rationale as booking_extras.
CREATE TABLE booking_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  price_tier_id INT NULL,
  label VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (price_tier_id) REFERENCES product_price_tiers(id) ON DELETE SET NULL,
  INDEX idx_booking_items_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  -- 'full'/'deposit' are Stripe-confirmed online payments; 'balance' is staff manually
  -- recording that the remaining balance (after a deposit) was settled some other way
  -- (cash, bank transfer, etc.) — see POST /bookings/:id/settle-balance.
  payment_type ENUM('full','deposit','balance') NOT NULL DEFAULT 'full',
  method VARCHAR(50),
  provider VARCHAR(30) NOT NULL DEFAULT 'stripe',
  provider_reference VARCHAR(255) NULL,
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  UNIQUE INDEX idx_payments_provider_reference (provider_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  channel ENUM('email','sms') NOT NULL,
  recipient VARCHAR(255) NULL,
  status ENUM('sent','failed') NOT NULL,
  detail TEXT,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A customer's self-service cancel/reschedule request that's waiting on admin sign-off
-- (see settings.booking_policy.requireApprovalForCancel/requireApprovalForReschedule).
-- The booking itself (status, schedule) is left untouched until the request is resolved —
-- 'payload' is the raw request body needed to re-validate and apply the change on approval.
CREATE TABLE booking_change_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  type ENUM('cancel','reschedule') NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  payload JSON NOT NULL,
  reason VARCHAR(500) NULL,
  admin_note VARCHAR(500) NULL,
  resolved_by INT NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES admins(id),
  INDEX idx_bcr_booking (booking_id),
  INDEX idx_bcr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id INT NULL,
  detail VARCHAR(1000),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Simple key/value store for business settings (auto-confirm toggle, business info).
CREATE TABLE settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
