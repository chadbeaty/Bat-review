import { parseSetting } from "@/lib/admin/settings-rules";

export const parseSettingForTest = (raw: string) => parseSetting("bats_only_mode", raw);
