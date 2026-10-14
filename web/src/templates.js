// Starter diagrams: the first diagram of every new account and the "From a template" list in the Diagrams tab.
// Written to show what DBML can do (notes, enums, composite keys, indexes, relationships with actions, groups and colors).

export const BLANK = `// Use DBML to define your database structure
// Open More → Database to import it from PostgreSQL / Oracle instead

Table users {
  id integer [pk]
  username varchar [not null]
  email varchar [unique]
  created_at timestamp
}

Table posts {
  id integer [pk]
  title varchar
  body text [note: 'Content of the post']
  user_id integer [not null]
  created_at timestamp
}

Ref user_posts: posts.user_id > users.id
`;

const SHOP = `Project shop {
  database_type: 'PostgreSQL'
  Note: '''
    Sample model: an online store.
    Customers place orders for products from a catalog and pay for them.
    Edit this diagram freely: it is only a starting point.
  '''
}

Enum order_status {
  pending [note: 'Created, waiting for payment']
  paid [note: 'Payment confirmed']
  shipped
  delivered
  cancelled
}

Enum payment_method {
  credit_card
  bank_transfer
  cash
}

// ---------- Customers

Table customers [headercolor: #3498DB, note: 'People who buy in the store'] {
  id integer [pk, increment]
  name varchar(120) [not null]
  email varchar(255) [unique, not null, note: 'Used to sign in']
  phone varchar(30)
  created_at timestamp [not null, default: \`now()\`]
}

Table addresses [headercolor: #3498DB, note: 'Shipping and billing addresses'] {
  id integer [pk, increment]
  customer_id integer [not null]
  street varchar(200) [not null]
  city varchar(100) [not null]
  state char(2)
  postal_code varchar(12) [not null]
  is_default boolean [not null, default: false]

  indexes {
    customer_id [name: 'idx_addresses_customer']
  }
}

// ---------- Catalog

Table categories [headercolor: #27AE60] {
  id integer [pk, increment]
  parent_id integer [note: 'Parent category (optional hierarchy)']
  name varchar(100) [unique, not null]
}

Table products [headercolor: #27AE60, note: 'Items for sale'] {
  id integer [pk, increment]
  category_id integer [not null]
  sku varchar(40) [unique, not null]
  name varchar(200) [not null]
  description text
  price decimal(10,2) [not null, note: 'Current selling price']
  stock integer [not null, default: 0]
  active boolean [not null, default: true]

  indexes {
    category_id
    (active, name) [name: 'idx_products_active_name']
  }
}

Table reviews [headercolor: #27AE60, note: 'Customer reviews'] {
  id integer [pk, increment]
  product_id integer [not null]
  customer_id integer [not null]
  rating smallint [not null, note: '1 to 5']
  comment text
  created_at timestamp [not null, default: \`now()\`]

  indexes {
    (product_id, customer_id) [unique, name: 'uq_review_once']
  }
}

// ---------- Sales

Table orders [headercolor: #E67E22, note: 'Orders'] {
  id integer [pk, increment]
  customer_id integer [not null]
  shipping_address_id integer [not null]
  status order_status [not null, default: 'pending']
  total decimal(12,2) [not null, default: 0]
  created_at timestamp [not null, default: \`now()\`]

  indexes {
    (customer_id, created_at) [name: 'idx_orders_customer_date']
    status
  }
}

Table order_items [headercolor: #E67E22, note: 'Lines of each order (composite key)'] {
  order_id integer [not null]
  product_id integer [not null]
  quantity integer [not null, default: 1]
  unit_price decimal(10,2) [not null, note: 'Price frozen at purchase time']

  indexes {
    (order_id, product_id) [pk]
  }
}

Table payments [headercolor: #E67E22] {
  id integer [pk, increment]
  order_id integer [not null]
  method payment_method [not null]
  amount decimal(12,2) [not null]
  paid_at timestamp
}

// ---------- Relationships

Ref: addresses.customer_id > customers.id [delete: cascade]
Ref: categories.parent_id > categories.id [delete: set null]
Ref: products.category_id > categories.id
Ref: reviews.product_id > products.id [delete: cascade]
Ref: reviews.customer_id > customers.id [delete: cascade]
Ref: orders.customer_id > customers.id
Ref: orders.shipping_address_id > addresses.id
Ref: order_items.order_id > orders.id [delete: cascade]
Ref: order_items.product_id > products.id
Ref: payments.order_id > orders.id [delete: cascade]

// ---------- Groups (coloured boxes on the diagram)

TableGroup Customers [color: #3498DB] {
  customers
  addresses
}

TableGroup Catalog [color: #27AE60] {
  categories
  products
  reviews
}

TableGroup Sales [color: #E67E22] {
  orders
  order_items
  payments
}

// ---------- Sticky note (drag it, double-click to edit, or delete it)

Note tip {
  '''
  Double-click a table header to collapse it.
  Drag this note anywhere, or delete it.
  '''
}
`;

export const TEMPLATES = [
  { id: 'shop', name: 'Online store — sample', description: 'Customers, catalog, orders and payments, with groups, enums, indexes and relationships.', title: 'Online store - sample', dbml: SHOP },
];
