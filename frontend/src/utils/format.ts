export const titleCase = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export const formatDate = (value?: string | null, withTime = false) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

export const asPercent = (value: number) => Math.round(value <= 1 ? value * 100 : value);
export const languageName = (code?: string | null) => ({ ta: "Tamil", hi: "Hindi", en: "English", te: "Telugu", ml: "Malayalam" }[code ?? ""] ?? code?.toUpperCase() ?? "Pending");
