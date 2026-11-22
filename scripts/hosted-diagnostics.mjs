// Never serialize remote errors: messages, details and bodies can contain secrets.
export function hostedFailureDetails(result) {
  const status =
    result?.status ?? result?.error?.status ?? result?.error?.context?.status;
  const code = result?.error?.code;
  const fields = [];
  if (Number.isInteger(status) && status >= 100 && status <= 599)
    fields.push(`HTTP ${status}`);
  if (typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code))
    fields.push(`database code ${code}`);
  return fields.length ? ` (${fields.join(', ')})` : '';
}
