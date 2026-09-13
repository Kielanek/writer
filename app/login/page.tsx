import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Log In</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back.</p>
      </div>

      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
