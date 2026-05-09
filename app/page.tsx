import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Ship Command Center
        </h1>
        <p className="mt-2 text-zinc-600">
          Sign in to access Command or Captain views.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="flex h-11 flex-1 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Sign up
          </Link>
        </div>

        <p className="mt-6 text-sm text-zinc-600">
          Password reset is available from the login screen.
        </p>
      </div>
    </div>
  );
}
