import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { detectLocale } from "@/lib/i18n/messages";

export default async function Root() {
  redirect(`/${detectLocale((await headers()).get("accept-language"))}`);
}
