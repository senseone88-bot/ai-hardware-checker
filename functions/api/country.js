export async function onRequest(context) {
  const { request } = context;

  const countryHeader = request.headers.get('cf-ipcountry');
  const countryCf = request.cf?.country;
  const ip = request.headers.get('cf-connecting-ip');
  const acceptLang = request.headers.get('accept-language');

  const body = {
    cf_ipcountry_header: countryHeader,
    cf_country: countryCf,
    ip: ip,
    accept_language: acceptLang,
    note: "cf-ipcountry is available both as header and cf.country. navigator.language fallback: use Intl.DateTimeFormat",
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}
