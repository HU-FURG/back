// Banco → Brasil
export const fromUTC = (date: Date) => {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
};

// Brasil → Banco (UTC)
export const toUTC = (date: Date) => {
  return new Date(
    new Date(date).toLocaleString("en-US", { timeZone: "UTC" })
  );
};

export function localToUTC(dateStr: string, timeStr: string) {
  const localDate = new Date(`${dateStr}T${timeStr}:00`);
  return new Date(
    localDate.toLocaleString("en-US", { timeZone: "UTC" })
  );
}