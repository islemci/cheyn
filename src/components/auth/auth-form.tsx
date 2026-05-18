"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

type AuthResponse = {
  error?: {
    message?: string;
  } | null;
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    try {
      const response = (
        isSignUp
          ? await authClient.signUp.email({
              email,
              name,
              password,
            })
          : await authClient.signIn.email({
              email,
              password,
            })
      ) as AuthResponse;

      if (response.error) {
        setError(response.error.message ?? "Authentication failed");
        return;
      }

      if (isSignUp) {
        const signInResponse = (await authClient.signIn.email({
          email,
          password,
        })) as AuthResponse;

        if (signInResponse.error) {
          setError(signInResponse.error.message ?? "Sign in failed");
          return;
        }
      }

      router.push("/dashboard/overview");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Authentication failed",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link href="/" className="mb-5 flex items-center gap-2 font-semibold">
            <Image
              src="/c.svg"
              alt=""
              width={27}
              height={32}
              className="theme-logo h-8 w-auto"
            />
            cheyn
          </Link>
          <CardTitle className="text-2xl">
            {isSignUp ? "Create developer account" : "Sign in"}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? "Use email and password to claim or create your developer record."
              : "Access your developer console and payment state."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            {isSignUp && (
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Name</span>
                <input
                  autoComplete="name"
                  className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  minLength={1}
                  onChange={(event) => setName(event.target.value)}
                  required
                  type="text"
                  value={name}
                />
              </label>
            )}
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Email</span>
              <input
                autoComplete="email"
                className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Password</span>
              <input
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="h-10 rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>

            {error && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {error}
              </div>
            )}

            <Button disabled={isPending} type="submit">
              {isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRight />
              )}
              {isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>

          <div className="mt-5 text-muted-foreground text-sm">
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <Link className="font-medium text-foreground" href="/sign-in">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New developer?{" "}
                <Link className="font-medium text-foreground" href="/sign-up">
                  Create an account
                </Link>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
