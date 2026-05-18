import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignInPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard/overview");
  }

  return <AuthForm mode="sign-in" />;
}
