// Empty state of an Administration panel: says what is missing and what to do, centred in the space the list will fill (so the panel does not look broken or lopsided)
export default function Empty({ title, children }) {
  return (
    <div className="admin-empty" role="status">
      <b>{title}</b>
      {children && <small>{children}</small>}
    </div>
  );
}
