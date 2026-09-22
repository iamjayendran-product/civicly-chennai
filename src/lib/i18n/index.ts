import en from './messages/en.json';

type MessageKey = keyof typeof en;

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let message: string = en[key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      message = message.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return message;
}

const RPC_ERROR_CODES = ['OUTSIDE_CMDA', 'RATE_LIMITED', 'INVALID_PHOTOS', 'INVALID_INPUT', 'AUTH_REQUIRED'] as const;

export function errorCodeToMessage(code: string): string {
  const known = (RPC_ERROR_CODES as readonly string[]).includes(code);
  return t(known ? (`errors.${code}` as MessageKey) : 'errors.UNKNOWN');
}
