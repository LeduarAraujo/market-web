import { cookies } from "next/headers";

export const profileSessionCookieName = "spt_market_profile";

const profileIdPattern = /^[a-f\d]{24}$/i;

export async function getSelectedProfileId() {
  const cookieStore = await cookies();
  const profileId = cookieStore.get(profileSessionCookieName)?.value;
  return profileId && profileIdPattern.test(profileId) ? profileId : null;
}

export function isValidProfileId(profileId: unknown): profileId is string {
  return typeof profileId === "string" && profileIdPattern.test(profileId);
}
