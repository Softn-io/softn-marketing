/*
 * Request guards shared by the booking Route Handlers.
 *
 * They keep the two booking endpoints reachable only from the site's own pages, in the same way as
 * the assistant route: a request from another origin, or one sent without a browser context at all,
 * is refused before any work is done.
 */

/**
 * True when the request comes from a page of the site itself.
 *
 * Both headers are set by the browser and can be absent outside one (a `curl` call, a server-side
 * call). A request carrying neither is refused: the booking endpoints exist for the site's own
 * pages only.
 *
 * @param request Incoming request.
 * @returns True when the request may be served.
 */
export const isSameOriginRequest = (request: Request): boolean => {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (origin !== null && origin !== expectedOrigin) return false
  if (fetchSite !== null && fetchSite !== 'same-origin') return false
  return origin !== null || fetchSite !== null
}

/**
 * True when the request declares a JSON body, whatever charset it carries.
 *
 * @param request Incoming request.
 * @returns True when the body is JSON.
 */
export const hasJsonContentType = (request: Request): boolean =>
  request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/json'
