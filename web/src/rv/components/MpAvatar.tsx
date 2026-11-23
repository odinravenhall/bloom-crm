/** Avatar d'un fan façon MyPulse : un rond bleu avec la première lettre de son pseudo. */
export function MpAvatar({ name, size = "size-9", className = "" }: { name?: string | null; size?: string; className?: string }) {
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white ${size} ${className}`} style={{ background: "#3577f1" }}>
      {letter}
    </span>
  );
}
