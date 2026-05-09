"use client";

import Link from "next/link";
import { type PropsWithChildren } from "react";

export function Card({ children }: PropsWithChildren) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      {children}
    </div>
  );
}

export function FieldLabel({
  children,
  htmlFor,
}: PropsWithChildren<{ htmlFor: string }>) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-900">
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-zinc-900 outline-none",
        "focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>
) {
  return (
    <button
      {...props}
      className={[
        "h-11 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white",
        "hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function InlineLink({
  href,
  children,
}: PropsWithChildren<{ href: string }>) {
  return (
    <Link href={href} className="font-medium text-zinc-900 hover:underline">
      {children}
    </Link>
  );
}

