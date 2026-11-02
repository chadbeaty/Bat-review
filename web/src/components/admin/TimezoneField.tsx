"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Sends the browser's UTC offset with a form, so a datetime-local value is read in the admin's own time zone. */
export function TimezoneField() {
  const offset = useSyncExternalStore(
    subscribe,
    () => String(new Date().getTimezoneOffset()),
    () => "0"
  );
  return <input type="hidden" name="tz_offset_minutes" value={offset} />;
}
