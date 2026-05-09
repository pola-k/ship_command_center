"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type UserAccountAvatarProps = {
  name: string;
  subtitle?: string;
  imageUrl?: string | null;
  status?: "ok" | "warn" | "danger" | "muted";
  size?: "sm" | "md" | "lg";
};

const sizeToClasses: Record<NonNullable<UserAccountAvatarProps["size"]>, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
};

const statusToClasses: Record<NonNullable<UserAccountAvatarProps["status"]>, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  danger: "bg-red-400",
  muted: "bg-white/20",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserAccountAvatar({
  name,
  subtitle,
  imageUrl,
  status = "muted",
  size = "md",
}: UserAccountAvatarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <AvatarPrimitive.Root
          className={cn(
            "inline-flex select-none items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-white/80",
            sizeToClasses[size]
          )}
        >
          <AvatarPrimitive.Image
            className="h-full w-full object-cover"
            src={imageUrl ?? undefined}
            alt={name}
          />
          <AvatarPrimitive.Fallback
            className="flex h-full w-full items-center justify-center font-semibold tracking-wide"
            delayMs={250}
          >
            {initials(name)}
          </AvatarPrimitive.Fallback>
        </AvatarPrimitive.Root>
        <span
          className={cn(
            "absolute bottom-0 right-0 block h-3 w-3 rounded-full border border-[#04131f]",
            statusToClasses[status]
          )}
        />
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{name}</div>
        {subtitle ? <div className="truncate text-xs text-white/60">{subtitle}</div> : null}
      </div>
    </div>
  );
}

