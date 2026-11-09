/** Hide most of a phone number or email address, for logs. */
export function mask(to: string) {
  if (to.includes('@')) {
    const [user = '', domain = ''] = to.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return to.length > 4 ? `${to.slice(0, 4)}***${to.slice(-3)}` : '***';
}
