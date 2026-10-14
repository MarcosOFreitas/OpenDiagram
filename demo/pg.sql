create schema shop;
create table shop.customers (
  id serial primary key,
  email varchar(255) not null unique,
  name text,
  created_at timestamp without time zone default now()
);
comment on table shop.customers is 'Registered customers';
comment on column shop.customers.email is 'Login email';
create table shop.products (
  id serial primary key,
  sku varchar(40) not null,
  price numeric(10,2) not null default 0
);
create index idx_products_sku on shop.products (sku);
create table shop.orders (
  id serial primary key,
  customer_id int not null references shop.customers(id) on delete cascade,
  status varchar(20) default 'new'
);
create index idx_orders_lower_status on shop.orders (lower(status));
create table shop.order_items (
  order_id int references shop.orders(id) on delete cascade,
  product_id int references shop.products(id),
  qty int not null default 1,
  primary key (order_id, product_id)
);

-- least-privilege user for the read-only guardrail demo (the "postgres" superuser triggers warnings)
create role reader login password 'reader';
grant connect on database demo to reader;
grant usage on schema shop to reader;
grant select on all tables in schema shop to reader;
-- user that can write: should be flagged by the privilege check
create role writer login password 'writer';
grant connect on database demo to writer;
grant usage on schema shop to writer;
grant select, insert, update, delete on all tables in schema shop to writer;
