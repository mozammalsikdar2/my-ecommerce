export function getMessengerHref(value: string) {
  let username = value.trim();
  if (!username) return null;

  if (/^https?:\/\//i.test(username)) {
    try {
      const url = new URL(username);
      if (!["m.me", "facebook.com", "www.facebook.com"].includes(url.hostname.toLowerCase())) {
        return null;
      }
      username = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }

  if (!/^[a-z\d.]{1,100}$/i.test(username)) return null;
  return `https://m.me/${encodeURIComponent(username)}`;
}

export function getWhatsappHref(number: string, message: string) {
  const cleanNumber = number.replace(/\D/g, "");
  return cleanNumber
    ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
    : null;
}

export function getCallHref(number: string) {
  const cleanNumber = number.replace(/[^\d+]/g, "");
  return /^\+?\d+$/.test(cleanNumber) ? `tel:${cleanNumber}` : null;
}
