-- runs as SYS; switch to the PDB, objects go to app user SHOP
alter session set container = FREEPDB1;
alter session set current_schema = shop;
create table customers (
  id number(10) primary key,
  email varchar2(255) not null,
  name varchar2(100),
  created_at date default sysdate
);
create unique index uq_customers_email on customers (email);
comment on table customers is 'Registered customers';
comment on column customers.email is 'Login email';
create table orders (
  id number(10) primary key,
  customer_id number(10) not null,
  status varchar2(20) default 'new',
  constraint fk_orders_customer foreign key (customer_id) references customers(id) on delete cascade
);
create index idx_orders_status on orders (status);
create table order_items (
  order_id number(10) not null,
  line_no number(5) not null,
  qty number(5) default 1 not null,
  constraint pk_order_items primary key (order_id, line_no),
  constraint fk_items_order foreign key (order_id) references orders(id)
);
