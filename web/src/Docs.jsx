// Help tab: how to use the app + DBML feature cheat-sheet. Each example can be inserted into the editor.
const STEPS = [
  ['Account', 'Your diagrams and database connections are private to your account and autosave. The Diagrams tab lists yours and the ones shared with you (administrators see every diagram of the organisation). Administrators create accounts and groups from the avatar menu → Administration; Account & password is in the same menu.'],
  ['Share', 'In the Share tab give a person or a whole group view, comment or edit access, or create an optional link. The highest level that applies wins. You can change or remove access anytime; connections and credentials are never shared.'],
  ['Connect', 'Open Database, fill host/port/database (Oracle: service name), user and password, then Test connection. Save keeps it for later (password stored encrypted).'],
  ['Import', 'Tick the schemas to read (optionally list table names) and press Import. Tables, columns, PK, FK, indexes and comments become DBML in the editor and a diagram on the canvas.'],
  ['Edit', 'The DBML editor is the source of truth: type to change the diagram live. Ctrl+Space autocompletes keywords, types, tables and table.column. Syntax errors are underlined and listed in the status bar. Ctrl+F searches and replaces. Drag the edge of the editor to resize it, or turn on line wrapping in View.'],
  ['Explore', 'Drag tables, click one to highlight its relationships, click a relationship line to focus its two tables, collapse/expand a table with the ▾ in its header (⊟ / ⊞ at the bottom for all) and select a table to drag its edge/corner handles to resize it, use the search box to dim non-matching tables, and Arrange to re-run the automatic layout (the ▾ next to it picks the algorithm: Auto, Left to right, Pipeline, Snowflake, Compact). The ⌁ button highlights every relationship and shows its name.'],
  ['Stay safe', 'Every session is opened read-only and only reads catalog metadata (never table data). If the credential has write/admin privileges the app warns you; tick "Block credentials with write privileges" to refuse them. Prefer a dedicated user with SELECT only.'],
  ['Keep fresh', 'After an import the connection stays linked: use the ↻ button in the top bar to re-read metadata, or set an automatic interval in the connection (runs while the page is open). Refresh keeps TableGroups and positions.'],
  ['TLS', 'PostgreSQL and Oracle (TCPS) support TLS. "Verify certificate" validates the chain and host name; paste the CA PEM for a private/self-signed CA. "Skip verification" encrypts without checking the certificate — avoid on untrusted networks.'],
  ['Docs', 'Switch Diagram → Docs in the top bar for a browsable page of your tables (search, constraints, notes, relationships). Click a table header to collapse/expand it (or use Collapse all). Click a dashed box to add your own comment on the project, a table or a column: comments are kept only in this app, never written to the database, and are included in the exported docs.'],
  ['Export', 'Export downloads DBML, SQL (PostgreSQL / MySQL / SQL Server / Oracle), JSON, PNG or SVG. The diagram title is used as the file name.'],
];

const EXAMPLES = [
  {
    title: 'Tables and columns',
    text: 'Column settings go in [brackets]: pk, not null, unique, increment, default, note.',
    code: `Table users {
  id integer [pk, increment]
  email varchar(255) [unique, not null, note: 'Login e-mail']
  status varchar [default: 'active']
  created_at timestamp [default: \`now()\`]
}`,
  },
  {
    title: 'Relationships (Ref)',
    text: 'Short form: > many-to-one, < one-to-many, - one-to-one, <> many-to-many. Add [delete: cascade] / [update: restrict]. Inline form: [ref: > users.id].',
    code: `Table customers {
  id integer [pk]
}

Table orders {
  id integer [pk]
  customer_id integer [not null, ref: > customers.id]
}

Table order_lines {
  order_id integer
  line_no integer
}

Ref fk_lines_order: order_lines.order_id > orders.id [delete: cascade]`,
  },
  {
    title: 'TableGroup with color',
    text: 'Groups draw a dashed, colored box around related tables (you can also build them in the Database tab: Choose tables → Groups). No color codes needed: type `color: ` for a preset list, or click the small color square after a hex to open the color picker.',
    code: `Table invoices {
  id integer [pk]
}

Table payments {
  id integer [pk]
  invoice_id integer [ref: > invoices.id]
}

TableGroup billing [color: #e67e22] {
  invoices
  payments
}`,
  },
  {
    title: 'Table header color and note',
    text: 'headercolor changes the table title bar (same preset list and click-to-pick color square as groups). Table notes show as a tooltip.',
    code: `Table products [headercolor: #3498DB, note: 'Catalog items'] {
  id integer [pk]
  sku varchar [unique]
  price decimal(10,2)
}`,
  },
  {
    title: 'Indexes',
    text: 'Single, composite and expression indexes; composite primary keys via [pk].',
    code: `Table order_items_ix {
  order_id integer
  product_id integer
  qty integer

  indexes {
    (order_id, product_id) [pk]
    qty [name: 'idx_qty']
    \`lower(sku)\` [unique, type: btree]
  }
}`,
  },
  {
    title: 'Enums',
    text: 'Use an enum as a column type.',
    code: `Enum order_status {
  new
  paid [note: 'Payment confirmed']
  shipped
}

Table shipments {
  id integer [pk]
  status order_status
}`,
  },
  {
    title: 'Schemas and project notes',
    text: 'Prefix tables with a schema. Project holds metadata.',
    code: `Project shop {
  database_type: 'PostgreSQL'
  Note: 'Shop schema overview'
}

Table sales.invoices {
  id integer [pk]
}`,
  },
];

export default function Docs({ onInsert, onCopy }) {
  return (
    <div className="dbody docs">
      <h4>Getting started</h4>
      <ol className="steps">
        {STEPS.map(([t, d]) => <li key={t}><b>{t}.</b> {d}</li>)}
      </ol>
      <h4>DBML cheat-sheet</h4>
      <small className="hint">Insert appends the snippet to the editor; the diagram updates immediately.</small>
      {EXAMPLES.map((ex) => (
        <div key={ex.title} className="ex">
          <b>{ex.title}</b>
          <small className="hint">{ex.text}</small>
          <pre>{ex.code}</pre>
          <div className="row">
            <button onClick={() => onInsert(ex.code)}>Insert in editor</button>
            <button onClick={() => onCopy(ex.code)}>Copy</button>
          </div>
        </div>
      ))}
      <h4>Tips</h4>
      <ul className="steps">
        <li>Oracle SQL files can not be parsed here — import Oracle live from the Database tab.</li>
        <li>Exporting SQL for a different engine than the source may need manual type/default edits.</li>
        <li>Press Esc to close this panel.</li>
      </ul>
    </div>
  );
}
