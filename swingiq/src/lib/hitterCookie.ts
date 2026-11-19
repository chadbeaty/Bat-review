/**
 * getgapper.com shows the scroll site (public/site) at "/" to anyone without this cookie, and the app to anyone with
 * it (see the rewrite in next.config.ts). It only says "this browser has a hitter set up"; the hitter itself stays in
 * IndexedDB on the device.
 */
export const HITTER_COOKIE = "gapper_hitter";

export function setHitterCookie(on: boolean) {
  if (typeof document === "undefined") return;
  const has = document.cookie.split("; ").some((c) => c.startsWith(`${HITTER_COOKIE}=`));
  if (on && !has) document.cookie = `${HITTER_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
  if (!on && has) document.cookie = `${HITTER_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
