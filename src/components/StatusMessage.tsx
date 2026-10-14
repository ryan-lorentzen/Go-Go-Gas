export function StatusMessage({ message, className = '' }: { message: string; className?: string }) {
  const displayMessage = /GOOGLE_PLACES_API_KEY/i.test(message)
    ? 'Live search is not configured. Try again later or contact the site owner.'
    : /[{}]|API key|PERMISSION_DENIED|REQUEST_DENIED/i.test(message)
      ? 'Live search is unavailable. Try again later.'
      : message;

  return <p className={`status-message status-error ${className}`} role="alert">{displayMessage}</p>;
}
