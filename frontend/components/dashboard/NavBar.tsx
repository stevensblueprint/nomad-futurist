"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface NavbarProps {
    username?: string;
    userEmail?: string;
    onSignOut?: () => void;
}
export function Navbar({ username = "Name", onSignOut }: NavbarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  return (
    <nav className="relative flex items-center justify-between border-b px-6 py-3 bg-black">
      {/* Left: Brand Logo & Main Nav Links */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          {!logoError ? (
            <Image
              src="/nomad-small.png"
              alt="Nomad Futurist logo"
              width={32}
              height={32}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-800 text-xs text-white">
              NF
            </div>
          )}
          <span className="font-semibold">Nomad Futurist</span>
        </Link>

        <div className="flex gap-4 text-sm">
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
          <Link href="/register">Register</Link>
        </div>
      </div>

      {/* Right: User Avatar */}
      <button
        type="button"
        aria-label="Profile menu"
        aria-expanded={profileOpen}
        onClick={() => setProfileOpen((open) => !open)}
      >
        {!avatarError ? (
          <Image
            src="/User.png"
            alt={username}
            width={32}
            height={32}
            className="rounded-full"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-sm">
            {username[0]}
          </div>
        )}
      </button>

      {/* Profile Dropdown Menu */}
    {profileOpen && (
  <div
    role="menu"
    className="absolute right-6 top-14 z-10 min-w-[10rem] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-md"
  >
    <Link
      href="/profile"
      role="menuitem"
      onClick={() => setProfileOpen(false)}
      className="block px-4 py-2 text-slate-800 hover:bg-slate-100"
    >
      Edit profile
    </Link>
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setProfileOpen(false);
        onSignOut?.();
      }}
      className="block w-full px-4 py-2 text-left text-slate-800 hover:bg-slate-100"
    >
      Log out
    </button>
  </div>
)}
    </nav>
  );
}