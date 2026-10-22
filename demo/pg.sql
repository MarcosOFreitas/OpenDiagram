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

-- A1 objects: enum, view, materialized view, sequence, trigger
create type shop.order_state as enum ('new', 'paid', 'shipped');
create view shop.v_customer_orders as select c.id customer_id, c.name, o.id order_id, o.status from shop.customers c join shop.orders o on o.customer_id = c.id;
comment on view shop.v_customer_orders is 'Orders with customer name';
create materialized view shop.mv_orders_by_status as select status, count(*) total from shop.orders group by status;
create sequence shop.invoice_seq start 1000; -- used by nothing: stays a loose Note
create sequence shop.ticket_seq start 1; -- used by a column default: goes into the note of that table
create table shop.tickets (id bigint primary key default nextval('shop.ticket_seq'), subject text);
create function shop.touch() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger trg_orders_touch before insert on shop.orders for each row execute function shop.touch();

-- multi-line comment: must not break the generated DBML
comment on column shop.products.sku is E'Stock keeping unit:\n1 = internal;\n2 = supplier';

-- check constraints and partitioning: a table check, a partitioned table (only the parent gets the PARTITIONED BY line) and a domain whose check stays out
alter table shop.products add constraint products_price_check check (price >= 0);
create domain shop.positive_int as int check (value > 0);
create table shop.events (id bigint not null, kind text not null, created_at date not null,
  constraint events_kind_check check (kind in ('click', 'view'))) partition by range (created_at);
create table shop.events_2026 partition of shop.events for values from ('2026-01-01') to ('2027-01-01');
