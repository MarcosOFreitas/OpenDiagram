-- Demo MySQL 8.4 database for the live import (docker-compose.demo.yml, service demo-mysql). Users, as for the PostgreSQL demo:
--   root / demo     every privilege: the import warns
--   writer / writer can change data in shop: the import warns
--   reader / reader SELECT and SHOW VIEW only: no warning
CREATE DATABASE shop;
USE shop;

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE COMMENT 'login',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT 'People who buy';

CREATE TABLE products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_products_sku (sku)
);

CREATE TABLE orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  status ENUM('new','paid','shipped') NOT NULL DEFAULT 'new',
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  KEY ix_orders_status (status, customer_id)
);

CREATE TABLE order_items (
  order_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, product_id),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE VIEW v_order_totals AS
  SELECT o.customer_id, c.name, SUM(o.total) AS total FROM orders o JOIN customers c ON c.id = o.customer_id GROUP BY o.customer_id, c.name;

CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON orders FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;

CREATE USER 'writer'@'%' IDENTIFIED BY 'writer';
GRANT SELECT, INSERT, UPDATE, DELETE ON shop.* TO 'writer'@'%';
CREATE USER 'reader'@'%' IDENTIFIED BY 'reader';
GRANT SELECT, SHOW VIEW ON shop.* TO 'reader'@'%';

-- check constraints and partitioning: a column check (named by MySQL), a named one, one that is not enforced (left out) and a partitioned table
ALTER TABLE products ADD CONSTRAINT products_price_check CHECK (price >= 0);
CREATE TABLE events (
  id BIGINT NOT NULL,
  kind VARCHAR(10) NOT NULL,
  created_at DATE NOT NULL,
  qty INT NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (id, created_at),
  CONSTRAINT events_kind_check CHECK (kind IN ('click', 'view')),
  CONSTRAINT events_qty_soft CHECK (qty < 100) NOT ENFORCED
) PARTITION BY RANGE (YEAR(created_at)) (PARTITION p2026 VALUES LESS THAN (2027), PARTITION pmax VALUES LESS THAN MAXVALUE);

-- generated columns: their expression goes to the column note
CREATE TABLE invoices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  net DECIMAL(10,2) NOT NULL,
  vat DECIMAL(10,2) NOT NULL,
  gross DECIMAL(10,2) AS (net + vat) STORED,
  label VARCHAR(40) AS (CONCAT('NET ', net)) VIRTUAL
);
