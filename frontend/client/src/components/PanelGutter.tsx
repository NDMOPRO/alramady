export default function PanelGutter() {
  return (
    <div
      className="w-4 shrink-0 cursor-col-resize flex items-center justify-center group"
      style={{ minWidth: 16 }}
    >
      <div className="w-1 h-8 rounded-full bg-transparent group-hover:bg-black/10 transition-colors" />
    </div>
  );
}
