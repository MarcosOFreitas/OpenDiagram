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

const SHOP = `Project loja {
  database_type: 'PostgreSQL'
  Note: '''
    Modelo de exemplo: loja virtual.
    Clientes fazem pedidos de produtos de um catálogo e pagam por eles.
    Edite este diagrama à vontade: ele é só um ponto de partida.
  '''
}

Enum order_status {
  pending [note: 'Criado, aguardando pagamento']
  paid [note: 'Pagamento confirmado']
  shipped
  delivered
  cancelled
}

Enum payment_method {
  credit_card
  pix
  boleto
}

// ---------- Clientes

Table customers [headercolor: #3498DB, note: 'Pessoas que compram na loja'] {
  id integer [pk, increment]
  name varchar(120) [not null]
  email varchar(255) [unique, not null, note: 'Usado no login']
  phone varchar(30)
  created_at timestamp [not null, default: \`now()\`]
}

Table addresses [headercolor: #3498DB, note: 'Endereços de entrega e cobrança'] {
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

// ---------- Catálogo

Table categories [headercolor: #27AE60] {
  id integer [pk, increment]
  parent_id integer [note: 'Categoria pai (hierarquia opcional)']
  name varchar(100) [unique, not null]
}

Table products [headercolor: #27AE60, note: 'Itens à venda'] {
  id integer [pk, increment]
  category_id integer [not null]
  sku varchar(40) [unique, not null]
  name varchar(200) [not null]
  description text
  price decimal(10,2) [not null, note: 'Preço atual de venda']
  stock integer [not null, default: 0]
  active boolean [not null, default: true]

  indexes {
    category_id
    (active, name) [name: 'idx_products_active_name']
  }
}

Table reviews [headercolor: #27AE60, note: 'Avaliações dos clientes'] {
  id integer [pk, increment]
  product_id integer [not null]
  customer_id integer [not null]
  rating smallint [not null, note: '1 a 5']
  comment text
  created_at timestamp [not null, default: \`now()\`]

  indexes {
    (product_id, customer_id) [unique, name: 'uq_review_once']
  }
}

// ---------- Vendas

Table orders [headercolor: #E67E22, note: 'Pedidos'] {
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

Table order_items [headercolor: #E67E22, note: 'Linhas de cada pedido (chave composta)'] {
  order_id integer [not null]
  product_id integer [not null]
  quantity integer [not null, default: 1]
  unit_price decimal(10,2) [not null, note: 'Preço congelado no momento da compra']

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

// ---------- Relacionamentos

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

// ---------- Grupos (caixas coloridas no diagrama)

TableGroup Clientes [color: #3498DB] {
  customers
  addresses
}

TableGroup Catalogo [color: #27AE60] {
  categories
  products
  reviews
}

TableGroup Vendas [color: #E67E22] {
  orders
  order_items
  payments
}
`;

export const TEMPLATES = [
  { id: 'shop', name: 'Loja virtual — modelo', description: 'Clientes, catálogo, pedidos e pagamentos, com grupos, enums, índices e relacionamentos.', title: 'Loja - modelo', dbml: SHOP },
];
